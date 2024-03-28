package org.loculus.backend.service.submission

import com.fasterxml.jackson.core.JacksonException
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.Op
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.less
import org.jetbrains.exposed.sql.SqlExpressionBuilder.plus
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.booleanParam
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.exists
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.kotlin.datetime.dateTimeParam
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.not
import org.jetbrains.exposed.sql.notExists
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.ApproveDataScope
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsType
import org.loculus.backend.api.DeleteSequenceScope
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.GetSequenceResponse
import org.loculus.backend.api.Organism
import org.loculus.backend.api.PreprocessingStatus
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.SequenceEntryStatus
import org.loculus.backend.api.SequenceEntryVersionToEdit
import org.loculus.backend.api.Status
import org.loculus.backend.api.SubmissionIdMapping
import org.loculus.backend.api.SubmittedProcessedData
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.api.WarningsFilter
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.controller.BadRequestException
import org.loculus.backend.controller.ProcessingValidationException
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.service.datauseterms.DataUseTermsTable
import org.loculus.backend.service.groupmanagement.GroupManagementDatabaseService
import org.loculus.backend.service.groupmanagement.GroupManagementPreconditionValidator
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.Version
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import javax.sql.DataSource

private val log = KotlinLogging.logger { }

@Service
@Transactional
class SubmissionDatabaseService(
    private val processedSequenceEntryValidatorFactory: ProcessedSequenceEntryValidatorFactory,
    private val accessionPreconditionValidator: AccessionPreconditionValidator,
    private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
    private val groupManagementDatabaseService: GroupManagementDatabaseService,
    private val objectMapper: ObjectMapper,
    pool: DataSource,
    private val emptyProcessedDataProvider: EmptyProcessedDataProvider,
    private val compressionService: CompressionService,
) {

    init {
        Database.connect(pool)
    }

    fun streamUnprocessedSubmissions(
        numberOfSequenceEntries: Int,
        organism: Organism,
        pipelineVersion: Long,
    ): Sequence<UnprocessedData> {
        log.info { "streaming unprocessed submissions. Requested $numberOfSequenceEntries sequence entries." }

        val currentProcessingPipelineVersion = getCurrentProcessingPipelineVersion()
        if (pipelineVersion < currentProcessingPipelineVersion) {
            throw UnprocessableEntityException("The processing pipeline version $pipelineVersion is not accepted " +
                    "anymore. The current pipeline version is $currentProcessingPipelineVersion.")
        }
        val unprocessedEntries = fetchUnprocessedEntries(organism, numberOfSequenceEntries, pipelineVersion)
        updateStatusToProcessing(unprocessedEntries, pipelineVersion)

        log.info {
            "streaming ${unprocessedEntries.size} of $numberOfSequenceEntries requested unprocessed submissions"
        }
        return unprocessedEntries.asSequence()
    }

    private fun getCurrentProcessingPipelineVersion(): Long {
        val table = CurrentProcessingPipelineTable
        return table
            .slice(table.versionColumn)
            .selectAll()
            .map {
                it[table.versionColumn]
            }
            .first()
    }

    private fun fetchUnprocessedEntries(
        organism: Organism,
        numberOfSequenceEntries: Int,
        pipelineVersion: Long,
    ): List<UnprocessedData> {
        val table = SequenceEntriesTable
        val preprocessing = SequenceEntriesPreprocessedDataTable
        return table
            .slice(table.accessionColumn, table.versionColumn, table.originalDataColumn)
            .select {
                exists(
                    CurrentProcessingPipelineTable.select {
                        CurrentProcessingPipelineTable.versionColumn lessEq pipelineVersion
                    },
                ) and
                    notExists(
                        preprocessing.select {
                            (table.accessionColumn eq preprocessing.accessionColumn) and
                                (table.versionColumn eq preprocessing.versionColumn) and
                                (preprocessing.pipelineVersionColumn eq pipelineVersion)
                        },
                    )
            }
            .orderBy(table.accessionColumn)
            .limit(numberOfSequenceEntries)
            .map {
                UnprocessedData(
                    it[table.accessionColumn],
                    it[table.versionColumn],
                    compressionService.decompressSequencesInOriginalData(
                        it[table.originalDataColumn]!!,
                        organism,
                    ),
                )
            }
    }

    private fun updateStatusToProcessing(sequenceEntries: List<UnprocessedData>, pipelineVersion: Long) {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        SequenceEntriesPreprocessedDataTable.batchInsert(sequenceEntries) {
            this[SequenceEntriesPreprocessedDataTable.accessionColumn] = it.accession
            this[SequenceEntriesPreprocessedDataTable.versionColumn] = it.version
            this[SequenceEntriesPreprocessedDataTable.pipelineVersionColumn] = pipelineVersion
            this[SequenceEntriesPreprocessedDataTable.processingStatusColumn] = PreprocessingStatus.IN_PROCESSING.name
            this[SequenceEntriesPreprocessedDataTable.startedProcessingAtColumn] = now
        }
    }

    fun updateProcessedData(inputStream: InputStream, organism: Organism, pipelineVersion: Long) {
        log.info { "updating processed data" }
        val reader = BufferedReader(InputStreamReader(inputStream))

        reader.lineSequence().forEach { line ->
            val submittedProcessedData = try {
                objectMapper.readValue<SubmittedProcessedData>(line)
            } catch (e: JacksonException) {
                throw BadRequestException("Failed to deserialize NDJSON line: ${e.message}", e)
            }

            insertProcessedDataWithStatus(submittedProcessedData, organism, pipelineVersion)
        }
    }

    private fun insertProcessedDataWithStatus(
        submittedProcessedData: SubmittedProcessedData,
        organism: Organism,
        pipelineVersion: Long,
    ) {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val submittedErrors = submittedProcessedData.errors.orEmpty()
        val submittedWarnings = submittedProcessedData.warnings.orEmpty()

        val (newStatus, processedData) = when {
            submittedErrors.isEmpty() -> PreprocessingStatus.FINISHED to validateProcessedData(
                submittedProcessedData,
                organism,
            )

            else -> PreprocessingStatus.HAS_ERRORS to submittedProcessedData.data
        }

        val table = SequenceEntriesPreprocessedDataTable
        val numberInserted =
            table.update(
                where = {
                    table.accessionVersionEquals(submittedProcessedData) and
                        table.statusIs(PreprocessingStatus.IN_PROCESSING) and
                        (table.pipelineVersionColumn eq pipelineVersion)
                },
            ) {
                it[processingStatusColumn] = newStatus.name
                it[processedDataColumn] = compressionService.compressSequencesInProcessedData(processedData, organism)
                it[errorsColumn] = submittedErrors
                it[warningsColumn] = submittedWarnings
                it[finishedProcessingAtColumn] = now
            }

        if (numberInserted != 1) {
            throwInsertFailedException(submittedProcessedData, pipelineVersion)
        }
    }

    private fun validateProcessedData(submittedProcessedData: SubmittedProcessedData, organism: Organism) = try {
        processedSequenceEntryValidatorFactory.create(organism).validate(submittedProcessedData.data)
    } catch (validationException: ProcessingValidationException) {
        throwIfIsSubmissionForWrongOrganism(submittedProcessedData, organism)
        throw validationException
    }

    private fun throwIfIsSubmissionForWrongOrganism(
        submittedProcessedData: SubmittedProcessedData,
        organism: Organism,
    ) {
        val resultRow = SequenceEntriesView.slice(SequenceEntriesView.organismColumn)
            .select(where = { SequenceEntriesView.accessionVersionEquals(submittedProcessedData) })
            .firstOrNull() ?: return

        if (resultRow[SequenceEntriesView.organismColumn] != organism.name) {
            throw UnprocessableEntityException(
                "Accession version ${submittedProcessedData.displayAccessionVersion()} is for organism " +
                    "${resultRow[SequenceEntriesView.organismColumn]}, " +
                    "but submitted data is for organism ${organism.name}",
            )
        }
    }

    private fun throwInsertFailedException(
        submittedProcessedData: SubmittedProcessedData,
        pipelineVersion: Long,
    ): String {
        val preprocessing = SequenceEntriesPreprocessedDataTable
        val selectedSequenceEntries = preprocessing
            .slice(
                preprocessing.accessionColumn,
                preprocessing.versionColumn,
                preprocessing.processingStatusColumn,
                preprocessing.pipelineVersionColumn,
            )
            .select(where = { preprocessing.accessionVersionEquals(submittedProcessedData) })

        val accessionVersion = submittedProcessedData.displayAccessionVersion()
        if (selectedSequenceEntries.all {
                it[preprocessing.processingStatusColumn] != PreprocessingStatus.IN_PROCESSING.name
            }
        ) {
            throw UnprocessableEntityException(
                "Accession version $accessionVersion does not exist or is not awaiting any processing results",
            )
        }
        if (selectedSequenceEntries.all { it[preprocessing.pipelineVersionColumn] != pipelineVersion }) {
            throw UnprocessableEntityException(
                "Accession version $accessionVersion is not awaiting processing results of version " +
                    "$pipelineVersion (anymore)",
            )
        }
        throw IllegalStateException(
            "Update processed data: Unexpected error for accession versions $accessionVersion",
        )
    }

    fun approveProcessedData(
        authenticatedUser: AuthenticatedUser,
        accessionVersionsFilter: List<AccessionVersion>?,
        organism: Organism,
        scope: ApproveDataScope,
    ): List<AccessionVersion> {
        if (accessionVersionsFilter == null) {
            log.info { "approving all sequences by all groups ${authenticatedUser.username} is member of" }
        } else {
            log.info { "approving ${accessionVersionsFilter.size} sequences by ${authenticatedUser.username}" }
        }

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        if (accessionVersionsFilter != null) {
            accessionPreconditionValidator.validateAccessionVersions(
                authenticatedUser,
                accessionVersionsFilter,
                listOf(Status.AWAITING_APPROVAL),
                organism,
            )
        }

        val statusCondition = SequenceEntriesView.statusIsOneOf(listOf(Status.AWAITING_APPROVAL))

        val accessionCondition = if (accessionVersionsFilter !== null) {
            SequenceEntriesView.accessionVersionIsIn(accessionVersionsFilter)
        } else if (authenticatedUser.isSuperUser) {
            Op.TRUE
        } else {
            SequenceEntriesView.groupIsOneOf(groupManagementDatabaseService.getGroupsOfUser(authenticatedUser))
        }

        val scopeCondition = if (scope == ApproveDataScope.WITHOUT_WARNINGS) {
            not(SequenceEntriesView.entriesWithWarnings)
        } else {
            Op.TRUE
        }

        val accessionVersionsToUpdate = SequenceEntriesView
            .select { statusCondition and accessionCondition and scopeCondition }
            .map { AccessionVersion(it[SequenceEntriesView.accessionColumn], it[SequenceEntriesView.versionColumn]) }

        for (accessionVersionsChunk in accessionVersionsToUpdate.chunked(1000)) {
            SequenceEntriesTable.update(
                where = {
                    SequenceEntriesTable.accessionVersionIsIn(accessionVersionsChunk)
                },
            ) {
                it[releasedAtColumn] = now
            }
        }

        return accessionVersionsToUpdate
    }

    fun getLatestVersions(organism: Organism): Map<Accession, Version> {
        val maxVersionExpression = SequenceEntriesView.versionColumn.max()
        return SequenceEntriesView
            .slice(SequenceEntriesView.accessionColumn, maxVersionExpression)
            .select(
                where = {
                    SequenceEntriesView.statusIs(Status.APPROVED_FOR_RELEASE) and SequenceEntriesView.organismIs(
                        organism,
                    )
                },
            )
            .groupBy(SequenceEntriesView.accessionColumn)
            .associate { it[SequenceEntriesView.accessionColumn] to it[maxVersionExpression]!! }
    }

    fun getLatestRevocationVersions(organism: Organism): Map<Accession, Version> {
        val maxVersionExpression = SequenceEntriesView.versionColumn.max()

        return SequenceEntriesView
            .slice(SequenceEntriesView.accessionColumn, maxVersionExpression)
            .select(
                where = {
                    SequenceEntriesView.statusIs(Status.APPROVED_FOR_RELEASE) and
                        (SequenceEntriesView.isRevocationColumn eq true) and
                        SequenceEntriesView.organismIs(organism)
                },
            )
            .groupBy(SequenceEntriesView.accessionColumn)
            .associate { it[SequenceEntriesView.accessionColumn] to it[maxVersionExpression]!! }
    }

    fun streamReleasedSubmissions(organism: Organism): Sequence<RawProcessedData> {
        return SequenceEntriesView.join(
            DataUseTermsTable,
            JoinType.LEFT,
            additionalConstraint = {
                (SequenceEntriesView.accessionColumn eq DataUseTermsTable.accessionColumn) and
                    (DataUseTermsTable.isNewestDataUseTerms)
            },
        )
            .slice(
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.isRevocationColumn,
                SequenceEntriesView.processedDataColumn,
                SequenceEntriesView.submitterColumn,
                SequenceEntriesView.groupNameColumn,
                SequenceEntriesView.submittedAtColumn,
                SequenceEntriesView.releasedAtColumn,
                SequenceEntriesView.submissionIdColumn,
                DataUseTermsTable.dataUseTermsTypeColumn,
                DataUseTermsTable.restrictedUntilColumn,
            )
            .select(
                where = {
                    SequenceEntriesView.statusIs(Status.APPROVED_FOR_RELEASE) and SequenceEntriesView.organismIs(
                        organism,
                    )
                },
            )
            .orderBy(
                SequenceEntriesView.accessionColumn to SortOrder.ASC,
                SequenceEntriesView.versionColumn to SortOrder.ASC,
            )
            .map {
                RawProcessedData(
                    accession = it[SequenceEntriesView.accessionColumn],
                    version = it[SequenceEntriesView.versionColumn],
                    isRevocation = it[SequenceEntriesView.isRevocationColumn],
                    submitter = it[SequenceEntriesView.submitterColumn],
                    group = it[SequenceEntriesView.groupNameColumn],
                    submissionId = it[SequenceEntriesView.submissionIdColumn],
                    processedData = when (val processedData = it[SequenceEntriesView.processedDataColumn]) {
                        null -> emptyProcessedDataProvider.provide(organism)
                        else -> compressionService.decompressSequencesInProcessedData(processedData, organism)
                    },
                    submittedAt = it[SequenceEntriesView.submittedAtColumn],
                    releasedAt = it[SequenceEntriesView.releasedAtColumn]!!,
                    dataUseTerms = DataUseTerms.fromParameters(
                        DataUseTermsType.fromString(it[DataUseTermsTable.dataUseTermsTypeColumn]),
                        it[DataUseTermsTable.restrictedUntilColumn],
                    ),
                )
            }
            .asSequence()
    }

    fun getSequences(
        authenticatedUser: AuthenticatedUser,
        organism: Organism?,
        groupsFilter: List<String>?,
        statusesFilter: List<Status>?,
        warningsFilter: WarningsFilter? = null,
        page: Int? = null,
        size: Int? = null,
    ): GetSequenceResponse {
        log.info {
            "getting sequence for user ${authenticatedUser.username} " +
                "(groupFilter: $groupsFilter in statuses $statusesFilter)." +
                " Page $page of size $size "
        }

        val listOfStatuses = statusesFilter ?: Status.entries

        val groupCondition = if (groupsFilter != null) {
            groupManagementPreconditionValidator.validateUserIsAllowedToModifyGroups(
                groupsFilter,
                authenticatedUser,
            )
            SequenceEntriesView.groupNameIsOneOf(groupsFilter)
        } else if (authenticatedUser.isSuperUser) {
            Op.TRUE
        } else {
            val groupsOfUser = groupManagementDatabaseService
                .getGroupsOfUser(authenticatedUser)
                .map { it.groupName }
            SequenceEntriesView.groupNameIsOneOf(groupsOfUser)
        }

        val baseQuery = SequenceEntriesView
            .join(
                DataUseTermsTable,
                JoinType.LEFT,
                additionalConstraint = {
                    (SequenceEntriesView.accessionColumn eq DataUseTermsTable.accessionColumn) and
                        (DataUseTermsTable.isNewestDataUseTerms)
                },
            )
            .slice(
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.submissionIdColumn,
                SequenceEntriesView.statusColumn,
                SequenceEntriesView.isRevocationColumn,
                SequenceEntriesView.groupNameColumn,
                SequenceEntriesView.submitterColumn,
                SequenceEntriesView.organismColumn,
                SequenceEntriesView.submittedAtColumn,
                DataUseTermsTable.dataUseTermsTypeColumn,
                DataUseTermsTable.restrictedUntilColumn,
            )
            .select(
                where = {
                    groupCondition
                },
            )
            .orderBy(SequenceEntriesView.accessionColumn)

        if (organism != null) {
            baseQuery.andWhere { SequenceEntriesView.organismIs(organism) }
        }

        val statusCounts: Map<Status, Int> = Status.entries.associateWith { status ->
            baseQuery.count { it[SequenceEntriesView.statusColumn] == status.name }
        }

        val filteredQuery = baseQuery.andWhere {
            SequenceEntriesView.statusIsOneOf(listOfStatuses)
        }

        if (warningsFilter == WarningsFilter.EXCLUDE_WARNINGS) {
            filteredQuery.andWhere {
                not(SequenceEntriesView.entriesWithWarnings)
            }
        }

        val pagedQuery = if (page != null && size != null) {
            filteredQuery.limit(size, (page * size).toLong())
        } else {
            filteredQuery
        }

        return GetSequenceResponse(
            sequenceEntries = pagedQuery
                .map { row ->
                    SequenceEntryStatus(
                        accession = row[SequenceEntriesView.accessionColumn],
                        version = row[SequenceEntriesView.versionColumn],
                        status = Status.fromString(row[SequenceEntriesView.statusColumn]),
                        group = row[SequenceEntriesView.groupNameColumn],
                        submitter = row[SequenceEntriesView.submitterColumn],
                        isRevocation = row[SequenceEntriesView.isRevocationColumn],
                        submissionId = row[SequenceEntriesView.submissionIdColumn],
                        dataUseTerms = DataUseTerms.fromParameters(
                            DataUseTermsType.fromString(row[DataUseTermsTable.dataUseTermsTypeColumn]),
                            row[DataUseTermsTable.restrictedUntilColumn],
                        ),
                    )
                },
            statusCounts = statusCounts,
        )
    }

    fun revoke(
        accessions: List<Accession>,
        authenticatedUser: AuthenticatedUser,
        organism: Organism,
    ): List<SubmissionIdMapping> {
        log.info { "revoking ${accessions.size} sequences" }

        accessionPreconditionValidator.validateAccessions(
            authenticatedUser,
            accessions,
            listOf(Status.APPROVED_FOR_RELEASE),
            organism,
        )

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)
        SequenceEntriesTable.insert(
            SequenceEntriesTable.slice(
                SequenceEntriesTable.accessionColumn,
                SequenceEntriesTable.versionColumn.plus(1),
                SequenceEntriesTable.submissionIdColumn,
                SequenceEntriesTable.submitterColumn,
                SequenceEntriesTable.groupNameColumn,
                dateTimeParam(now),
                booleanParam(true),
                SequenceEntriesTable.organismColumn,
            ).select(
                where = {
                    (SequenceEntriesTable.accessionColumn inList accessions) and
                        SequenceEntriesTable.isMaxVersion
                },
            ),
            columns = listOf(
                SequenceEntriesTable.accessionColumn,
                SequenceEntriesTable.versionColumn,
                SequenceEntriesTable.submissionIdColumn,
                SequenceEntriesTable.submitterColumn,
                SequenceEntriesTable.groupNameColumn,
                SequenceEntriesTable.submittedAtColumn,
                SequenceEntriesTable.isRevocationColumn,
                SequenceEntriesTable.organismColumn,
            ),
        )

        return SequenceEntriesView
            .slice(
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.isRevocationColumn,
                SequenceEntriesView.groupNameColumn,
                SequenceEntriesView.submissionIdColumn,
            )
            .select(
                where = {
                    (SequenceEntriesView.accessionColumn inList accessions) and
                        SequenceEntriesView.isMaxVersion and
                        SequenceEntriesView.statusIs(Status.AWAITING_APPROVAL)
                },
            )
            .orderBy(SequenceEntriesView.accessionColumn)
            .map {
                SubmissionIdMapping(
                    it[SequenceEntriesView.accessionColumn],
                    it[SequenceEntriesView.versionColumn],
                    it[SequenceEntriesView.submissionIdColumn],
                )
            }
    }

    fun deleteSequenceEntryVersions(
        accessionVersionsFilter: List<AccessionVersion>?,
        authenticatedUser: AuthenticatedUser,
        organism: Organism,
        scope: DeleteSequenceScope,
    ): List<AccessionVersion> {
        if (accessionVersionsFilter == null) {
            log.info {
                "deleting all sequences of all groups ${authenticatedUser.username} is member of in the scope $scope"
            }
        } else {
            log.info {
                "deleting ${accessionVersionsFilter.size} sequences by ${authenticatedUser.username} in scope $scope"
            }
        }

        val listOfDeletableStatuses = listOf(
            Status.RECEIVED,
            Status.AWAITING_APPROVAL,
            Status.HAS_ERRORS,
        )

        if (accessionVersionsFilter != null) {
            accessionPreconditionValidator.validateAccessionVersions(
                authenticatedUser,
                accessionVersionsFilter,
                listOfDeletableStatuses,
                organism,
            )
        }

        val accessionCondition = if (accessionVersionsFilter != null) {
            SequenceEntriesView.accessionVersionIsIn(accessionVersionsFilter)
        } else if (authenticatedUser.isSuperUser) {
            Op.TRUE
        } else {
            SequenceEntriesView.groupIsOneOf(groupManagementDatabaseService.getGroupsOfUser(authenticatedUser))
        }

        val scopeCondition = when (scope) {
            DeleteSequenceScope.PROCESSED_WITH_ERRORS -> SequenceEntriesView.statusIs(Status.HAS_ERRORS)
            DeleteSequenceScope.PROCESSED_WITH_WARNINGS -> SequenceEntriesView.statusIs(Status.AWAITING_APPROVAL) and
                SequenceEntriesView.entriesWithWarnings

            DeleteSequenceScope.ALL -> SequenceEntriesView.statusIsOneOf(listOfDeletableStatuses)
        }

        val sequenceEntriesToDelete = SequenceEntriesView
            .slice(SequenceEntriesView.accessionColumn, SequenceEntriesView.versionColumn)
            .select { accessionCondition and scopeCondition }
            .map {
                AccessionVersion(
                    it[SequenceEntriesView.accessionColumn],
                    it[SequenceEntriesView.versionColumn],
                )
            }

        for (accessionVersionsChunk in sequenceEntriesToDelete.chunked(1000)) {
            SequenceEntriesTable.deleteWhere { accessionVersionIsIn(accessionVersionsChunk) }
        }

        return sequenceEntriesToDelete
    }

    fun submitEditedData(
        authenticatedUser: AuthenticatedUser,
        editedAccessionVersion: UnprocessedData,
        organism: Organism,
    ) {
        log.info { "edited sequence entry submitted $editedAccessionVersion" }

        accessionPreconditionValidator.validateAccessionVersions(
            authenticatedUser,
            listOf(editedAccessionVersion),
            listOf(Status.AWAITING_APPROVAL, Status.HAS_ERRORS),
            organism,
        )

        SequenceEntriesPreprocessedDataTable.deleteWhere {
            accessionVersionEquals(editedAccessionVersion)
        }
    }

    fun getSequenceEntryVersionToEdit(
        authenticatedUser: AuthenticatedUser,
        accessionVersion: AccessionVersion,
        organism: Organism,
    ): SequenceEntryVersionToEdit {
        log.info {
            "Getting sequence entry ${accessionVersion.displayAccessionVersion()} " +
                "by ${authenticatedUser.username} to edit"
        }

        accessionPreconditionValidator.validateAccessionVersions(
            authenticatedUser,
            listOf(accessionVersion),
            listOf(Status.HAS_ERRORS, Status.AWAITING_APPROVAL),
            organism,
        )

        val selectedSequenceEntry = SequenceEntriesView.slice(
            SequenceEntriesView.accessionColumn,
            SequenceEntriesView.versionColumn,
            SequenceEntriesView.statusColumn,
            SequenceEntriesView.processedDataColumn,
            SequenceEntriesView.originalDataColumn,
            SequenceEntriesView.errorsColumn,
            SequenceEntriesView.warningsColumn,
            SequenceEntriesView.isRevocationColumn,
        )
            .select(
                where = {
                    SequenceEntriesView.accessionVersionEquals(accessionVersion)
                },
            )
            .first()

        if (selectedSequenceEntry[SequenceEntriesView.isRevocationColumn]) {
            throw UnprocessableEntityException(
                "Accession version ${accessionVersion.displayAccessionVersion()} is a revocation.",
            )
        }

        return SequenceEntryVersionToEdit(
            accession = selectedSequenceEntry[SequenceEntriesView.accessionColumn],
            version = selectedSequenceEntry[SequenceEntriesView.versionColumn],
            status = Status.fromString(selectedSequenceEntry[SequenceEntriesView.statusColumn]),
            processedData = compressionService.decompressSequencesInProcessedData(
                selectedSequenceEntry[SequenceEntriesView.processedDataColumn]!!,
                organism,
            ),
            originalData = compressionService.decompressSequencesInOriginalData(
                selectedSequenceEntry[SequenceEntriesView.originalDataColumn]!!,
                organism,
            ),
            errors = selectedSequenceEntry[SequenceEntriesView.errorsColumn],
            warnings = selectedSequenceEntry[SequenceEntriesView.warningsColumn],
        )
    }

    fun cleanUpStaleSequencesInProcessing(timeToStaleInSeconds: Long) {
        val staleDateTime = Instant.fromEpochMilliseconds(
            Clock.System.now().toEpochMilliseconds() - timeToStaleInSeconds * 1000,
        ).toLocalDateTime(TimeZone.UTC)

        val numberDeleted = SequenceEntriesPreprocessedDataTable.deleteWhere {
            statusIs(PreprocessingStatus.IN_PROCESSING) and startedProcessingAtColumn.less(staleDateTime)
        }
        log.info { "Cleaning up $numberDeleted stale sequences in processing" }
    }

    fun useNewerProcessingPipelineIfPossible(): Long? {
        val sql = """
            update current_processing_pipeline
            set
                version = newest.version,
                started_using_at = now()
            from
                (
                    select max(pipeline_version) as version
                    from
                        ( -- Newer pipeline versions...
                            select distinct pipeline_version
                            from sequence_entries_preprocessed_data
                            where pipeline_version > (select version from current_processing_pipeline)
                        ) as newer
                    where
                        not exists( -- ...for which no sequence exists...
                            select
                            from
                                ( -- ...that was processed successfully with the current version...
                                    select accession, version
                                    from sequence_entries_preprocessed_data
                                    where
                                        pipeline_version = (select version from current_processing_pipeline)
                                        and processing_status = 'FINISHED'
                                ) as successful
                            where
                                -- ...but not successfully with the newer version.
                                not exists(
                                    select
                                    from sequence_entries_preprocessed_data this
                                    where
                                        this.pipeline_version = newer.pipeline_version
                                        and this.accession = successful.accession
                                        and this.version = successful.version
                                        and this.processing_status = 'FINISHED'
                                )
                        )
                ) as newest
            where
                newest.version is not null
            returning newest.version;
        """.trimIndent()
        var newVersion: Long? = null
        transaction {
            exec(sql) { rs ->
                if (rs.next()) {
                    newVersion = rs.getLong("version")
                }
            }
        }
        return newVersion
    }
}

data class RawProcessedData(
    override val accession: Accession,
    override val version: Version,
    val isRevocation: Boolean,
    val submitter: String,
    val group: String,
    val submittedAt: LocalDateTime,
    val releasedAt: LocalDateTime,
    val submissionId: String,
    val processedData: ProcessedData<GeneticSequence>,
    val dataUseTerms: DataUseTerms,
) : AccessionVersionInterface
