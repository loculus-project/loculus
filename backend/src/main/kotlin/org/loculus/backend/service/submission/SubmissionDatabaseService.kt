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
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.kotlin.datetime.dateTimeParam
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.not
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.update
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.ApproveDataScope
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsType
import org.loculus.backend.api.DeleteSequenceScope
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
    private val entriesViewProvider: SequenceEntriesViewProvider,
    private val entriesTableProvider: SequenceEntriesTableProvider,
    private val preprocessingTableProvider: SequenceEntriesPreprocessedDataTableProvider,
    private val emptyProcessedDataProvider: EmptyProcessedDataProvider,
) {

    init {
        Database.connect(pool)
    }

    fun streamUnprocessedSubmissions(numberOfSequenceEntries: Int, organism: Organism): Sequence<UnprocessedData> {
        log.info { "streaming unprocessed submissions. Requested $numberOfSequenceEntries sequence entries." }

        val unprocessedEntries = fetchUnprocessedEntries(organism, numberOfSequenceEntries)
        updateStatusToProcessing(organism, unprocessedEntries)

        log.info {
            "streaming ${unprocessedEntries.size} of $numberOfSequenceEntries requested unprocessed submissions"
        }
        return unprocessedEntries.asSequence()
    }

    private fun fetchUnprocessedEntries(organism: Organism, numberOfSequenceEntries: Int): List<UnprocessedData> {
        entriesViewProvider.get(organism).let { view ->
            val sequenceEntryData = view
                .slice(view.accessionColumn, view.versionColumn, view.originalDataColumn)
                .select(
                    where = { view.statusIs(Status.RECEIVED) and view.isMaxVersion and view.organismIs(organism) },
                )
                .limit(numberOfSequenceEntries)
                .orderBy(view.accessionColumn)
                .map {
                    UnprocessedData(
                        it[view.accessionColumn],
                        it[view.versionColumn],
                        it[view.originalDataColumn]!!,
                    )
                }
            return sequenceEntryData
        }
    }

    private fun updateStatusToProcessing(organism: Organism, sequenceEntries: List<UnprocessedData>) {
        preprocessingTableProvider.get(organism).let { table ->
            val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

            table.batchInsert(sequenceEntries) {
                this[table.accessionColumn] = it.accession
                this[table.versionColumn] = it.version
                this[table.pipelineVersion] = 1
                this[table.processingStatusColumn] = PreprocessingStatus.IN_PROCESSING.name
                this[table.startedProcessingAtColumn] = now
            }
        }
    }

    fun updateProcessedData(inputStream: InputStream, organism: Organism) {
        log.info { "updating processed data" }
        val reader = BufferedReader(InputStreamReader(inputStream))

        reader.lineSequence().forEach { line ->
            val submittedProcessedData = try {
                objectMapper.readValue<SubmittedProcessedData>(line)
            } catch (e: JacksonException) {
                throw BadRequestException("Failed to deserialize NDJSON line: ${e.message}", e)
            }

            insertProcessedDataWithStatus(submittedProcessedData, organism)
        }
    }

    private fun insertProcessedDataWithStatus(submittedProcessedData: SubmittedProcessedData, organism: Organism) {
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

        val numberInserted = preprocessingTableProvider.get(organism).let { table ->
            table.update(
                where = {
                    table.accessionVersionEquals(submittedProcessedData) and
                        table.statusIs(PreprocessingStatus.IN_PROCESSING)
                },
            ) {
                it[processingStatusColumn] = newStatus.name
                it[processedDataColumn] = processedData
                it[errorsColumn] = submittedErrors
                it[warningsColumn] = submittedWarnings
                it[finishedProcessingAtColumn] = now
            }
        }

        if (numberInserted != 1) {
            throwInsertFailedException(submittedProcessedData, organism)
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
        entriesViewProvider.get(organism).let { table ->
            val resultRow = table.slice(table.organismColumn)
                .select(where = { table.accessionVersionEquals(submittedProcessedData) })
                .firstOrNull() ?: return

            if (resultRow[table.organismColumn] != organism.name) {
                throw UnprocessableEntityException(
                    "Accession version ${submittedProcessedData.displayAccessionVersion()} is for organism " +
                        "${resultRow[table.organismColumn]}, but submitted data is for organism ${organism.name}",
                )
            }
        }
    }

    private fun throwInsertFailedException(submittedProcessedData: SubmittedProcessedData, organism: Organism): String {
        entriesViewProvider.get(organism).let { table ->
            val selectedSequenceEntries = table
                .slice(
                    table.accessionColumn,
                    table.versionColumn,
                    table.statusColumn,
                )
                .select(where = { table.accessionVersionEquals(submittedProcessedData) })

            val accessionVersion = submittedProcessedData.displayAccessionVersion()
            if (selectedSequenceEntries.count() == 0L) {
                throw UnprocessableEntityException("Accession version $accessionVersion does not exist")
            }

            val selectedSequence = selectedSequenceEntries.first()
            if (selectedSequence[table.statusColumn] != Status.IN_PROCESSING.name) {
                throw UnprocessableEntityException(
                    "Accession version $accessionVersion is in not in state ${Status.IN_PROCESSING} " +
                        "(was ${selectedSequence[table.statusColumn]})",
                )
            }

            throw RuntimeException("Update processed data: Unexpected error for accession versions $accessionVersion")
        }
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

        val view = entriesViewProvider.get(organism)
        val table = entriesTableProvider.get(organism)

        val statusCondition = view.statusIsOneOf(listOf(Status.AWAITING_APPROVAL))

        val accessionCondition = if (accessionVersionsFilter !== null) {
            view.accessionVersionIsIn(accessionVersionsFilter)
        } else if (authenticatedUser.isSuperUser) {
            Op.TRUE
        } else {
            view.groupIsOneOf(groupManagementDatabaseService.getGroupsOfUser(authenticatedUser))
        }

        val scopeCondition = if (scope == ApproveDataScope.WITHOUT_WARNINGS) {
            not(view.entriesWithWarnings)
        } else {
            Op.TRUE
        }

        val accessionVersionsToUpdate = view
            .select { statusCondition and accessionCondition and scopeCondition }
            .map { AccessionVersion(it[view.accessionColumn], it[view.versionColumn]) }

        for (accessionVersionsChunk in accessionVersionsToUpdate.chunked(1000)) {
            table.update(
                where = {
                    table.accessionVersionIsIn(accessionVersionsChunk)
                },
            ) {
                it[releasedAtColumn] = now
            }
        }

        return accessionVersionsToUpdate
    }

    fun getLatestVersions(organism: Organism): Map<Accession, Version> {
        entriesViewProvider.get(organism).let { view ->
            val maxVersionExpression = view.versionColumn.max()
            return view
                .slice(view.accessionColumn, maxVersionExpression)
                .select(
                    where = { view.statusIs(Status.APPROVED_FOR_RELEASE) and view.organismIs(organism) },
                )
                .groupBy(view.accessionColumn)
                .associate { it[view.accessionColumn] to it[maxVersionExpression]!! }
        }
    }

    fun getLatestRevocationVersions(organism: Organism): Map<Accession, Version> {
        entriesViewProvider.get(organism).let { view ->
            val maxVersionExpression = view.versionColumn.max()
            return view
                .slice(view.accessionColumn, maxVersionExpression)
                .select(
                    where = {
                        view.statusIs(Status.APPROVED_FOR_RELEASE) and
                            (view.isRevocationColumn eq true) and
                            view.organismIs(organism)
                    },
                )
                .groupBy(view.accessionColumn)
                .associate { it[view.accessionColumn] to it[maxVersionExpression]!! }
        }
    }

    fun streamReleasedSubmissions(organism: Organism): Sequence<RawProcessedData> {
        return entriesViewProvider.get(organism).let { view ->
            view.join(
                DataUseTermsTable,
                JoinType.LEFT,
                additionalConstraint = {
                    (view.accessionColumn eq DataUseTermsTable.accessionColumn) and
                        (DataUseTermsTable.isNewestDataUseTerms)
                },
            )
                .slice(
                    view.accessionColumn,
                    view.versionColumn,
                    view.isRevocationColumn,
                    view.processedDataColumn,
                    view.submitterColumn,
                    view.groupNameColumn,
                    view.submittedAtColumn,
                    view.releasedAtColumn,
                    view.submissionIdColumn,
                    DataUseTermsTable.dataUseTermsTypeColumn,
                    DataUseTermsTable.restrictedUntilColumn,
                )
                .select(
                    where = { view.statusIs(Status.APPROVED_FOR_RELEASE) and view.organismIs(organism) },
                )
                .orderBy(view.accessionColumn to SortOrder.ASC, view.versionColumn to SortOrder.ASC)
                .map {
                    RawProcessedData(
                        accession = it[view.accessionColumn],
                        version = it[view.versionColumn],
                        isRevocation = it[view.isRevocationColumn],
                        submitter = it[view.submitterColumn],
                        group = it[view.groupNameColumn],
                        submissionId = it[view.submissionIdColumn],
                        processedData = it[view.processedDataColumn] ?: emptyProcessedDataProvider.provide(organism),
                        submittedAt = it[view.submittedAtColumn],
                        releasedAt = it[view.releasedAtColumn]!!,
                        dataUseTerms = DataUseTerms.fromParameters(
                            DataUseTermsType.fromString(it[DataUseTermsTable.dataUseTermsTypeColumn]),
                            it[DataUseTermsTable.restrictedUntilColumn],
                        ),
                    )
                }
                .asSequence()
        }
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

        entriesViewProvider.get(organism).let { view ->
            val groupCondition = if (groupsFilter != null) {
                groupManagementPreconditionValidator.validateUserIsAllowedToModifyGroups(
                    groupsFilter,
                    authenticatedUser,
                )
                view.groupNameIsOneOf(groupsFilter)
            } else if (authenticatedUser.isSuperUser) {
                Op.TRUE
            } else {
                val groupsOfUser = groupManagementDatabaseService
                    .getGroupsOfUser(authenticatedUser)
                    .map { it.groupName }
                view.groupNameIsOneOf(groupsOfUser)
            }

            val baseQuery = view
                .join(
                    DataUseTermsTable,
                    JoinType.LEFT,
                    additionalConstraint = {
                        (view.accessionColumn eq DataUseTermsTable.accessionColumn) and
                            (DataUseTermsTable.isNewestDataUseTerms)
                    },
                )
                .slice(
                    view.accessionColumn,
                    view.versionColumn,
                    view.submissionIdColumn,
                    view.statusColumn,
                    view.isRevocationColumn,
                    view.groupNameColumn,
                    view.submitterColumn,
                    view.organismColumn,
                    view.submittedAtColumn,
                    DataUseTermsTable.dataUseTermsTypeColumn,
                    DataUseTermsTable.restrictedUntilColumn,
                )
                .select(
                    where = {
                        groupCondition
                    },
                )
                .orderBy(view.accessionColumn)

            if (organism != null) {
                baseQuery.andWhere { view.organismIs(organism) }
            }

            val statusCounts: Map<Status, Int> = Status.entries.associateWith { status ->
                baseQuery.count { it[view.statusColumn] == status.name }
            }

            val filteredQuery = baseQuery.andWhere {
                view.statusIsOneOf(listOfStatuses)
            }

            if (warningsFilter == WarningsFilter.EXCLUDE_WARNINGS) {
                filteredQuery.andWhere {
                    not(view.entriesWithWarnings)
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
                            accession = row[view.accessionColumn],
                            version = row[view.versionColumn],
                            status = Status.fromString(row[view.statusColumn]),
                            group = row[view.groupNameColumn],
                            submitter = row[view.submitterColumn],
                            isRevocation = row[view.isRevocationColumn],
                            submissionId = row[view.submissionIdColumn],
                            dataUseTerms = DataUseTerms.fromParameters(
                                DataUseTermsType.fromString(row[DataUseTermsTable.dataUseTermsTypeColumn]),
                                row[DataUseTermsTable.restrictedUntilColumn],
                            ),
                        )
                    },
                statusCounts = statusCounts,
            )
        }
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
        entriesTableProvider.get(organism).let { table ->
            table.insert(
                table.slice(
                    table.accessionColumn,
                    table.versionColumn.plus(1),
                    table.submissionIdColumn,
                    table.submitterColumn,
                    table.groupNameColumn,
                    dateTimeParam(now),
                    booleanParam(true),
                    table.organismColumn,
                ).select(
                    where = {
                        (table.accessionColumn inList accessions) and
                            table.isMaxVersion
                    },
                ),
                columns = listOf(
                    table.accessionColumn,
                    table.versionColumn,
                    table.submissionIdColumn,
                    table.submitterColumn,
                    table.groupNameColumn,
                    table.submittedAtColumn,
                    table.isRevocationColumn,
                    table.organismColumn,
                ),
            )
        }

        entriesViewProvider.get(organism).let { view ->
            return view
                .slice(
                    view.accessionColumn,
                    view.versionColumn,
                    view.isRevocationColumn,
                    view.groupNameColumn,
                    view.submissionIdColumn,
                )
                .select(
                    where = {
                        (view.accessionColumn inList accessions) and
                            view.isMaxVersion and
                            view.statusIs(Status.AWAITING_APPROVAL)
                    },
                )
                .orderBy(view.accessionColumn)
                .map {
                    SubmissionIdMapping(
                        it[view.accessionColumn],
                        it[view.versionColumn],
                        it[view.submissionIdColumn],
                    )
                }
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

        val sequenceEntriesToDelete = entriesViewProvider
            .get(organism)
            .let { view ->
                val accessionCondition = if (accessionVersionsFilter != null) {
                    view.accessionVersionIsIn(accessionVersionsFilter)
                } else if (authenticatedUser.isSuperUser) {
                    Op.TRUE
                } else {
                    view.groupIsOneOf(groupManagementDatabaseService.getGroupsOfUser(authenticatedUser))
                }

                val scopeCondition = when (scope) {
                    DeleteSequenceScope.PROCESSED_WITH_ERRORS -> view.statusIs(Status.HAS_ERRORS)
                    DeleteSequenceScope.PROCESSED_WITH_WARNINGS -> view.statusIs(Status.AWAITING_APPROVAL) and
                        view.entriesWithWarnings

                    DeleteSequenceScope.ALL -> view.statusIsOneOf(listOfDeletableStatuses)
                }

                view.slice(view.accessionColumn, view.versionColumn)
                    .select { accessionCondition and scopeCondition }
                    .map { AccessionVersion(it[view.accessionColumn], it[view.versionColumn]) }
            }

        entriesTableProvider.get(organism).let { table ->
            for (accessionVersionsChunk in sequenceEntriesToDelete.chunked(1000)) {
                table.deleteWhere { accessionVersionIsIn(accessionVersionsChunk) }
            }
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

        preprocessingTableProvider.get(organism).let { table ->
            table.deleteWhere {
                table.accessionVersionEquals(editedAccessionVersion)
            }
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

        entriesViewProvider.get(organism).let { view ->
            val selectedSequenceEntries = view.slice(
                view.accessionColumn,
                view.versionColumn,
                view.statusColumn,
                view.processedDataColumn,
                view.originalDataColumn,
                view.errorsColumn,
                view.warningsColumn,
                view.isRevocationColumn,
            )
                .select(
                    where = {
                        view.accessionVersionEquals(accessionVersion)
                    },
                )

            return selectedSequenceEntries.first().let {
                if (it[view.isRevocationColumn]) {
                    throw UnprocessableEntityException(
                        "Accession version ${accessionVersion.displayAccessionVersion()} is a revocation.",
                    )
                }

                SequenceEntryVersionToEdit(
                    it[view.accessionColumn],
                    it[view.versionColumn],
                    Status.fromString(it[view.statusColumn]),
                    it[view.processedDataColumn]!!,
                    it[view.originalDataColumn]!!,
                    it[view.errorsColumn],
                    it[view.warningsColumn],
                )
            }
        }
    }

    fun cleanUpStaleSequencesInProcessing(timeToStaleInSeconds: Long) {
        val staleDateTime = Instant.fromEpochMilliseconds(
            Clock.System.now().toEpochMilliseconds() - timeToStaleInSeconds * 1000,
        ).toLocalDateTime(TimeZone.UTC)

        preprocessingTableProvider.get(null).let { table ->
            val numberDeleted = table.deleteWhere {
                table.statusIs(PreprocessingStatus.IN_PROCESSING) and
                    table.startedProcessingAtColumn.less(
                        staleDateTime,
                    )
            }
            log.info { "Cleaning up $numberDeleted stale sequences in processing" }
        }
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
    val processedData: ProcessedData,
    val dataUseTerms: DataUseTerms,
) : AccessionVersionInterface
