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
import kotlin.sequences.Sequence
import kotlin.sequences.forEach

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
                    "Accession version $accessionVersion is in not in state $Status.IN_PROCESSING " +
                        "(was ${selectedSequence[table.statusColumn]})",
                )
            }

            throw RuntimeException("Update processed data: Unexpected error for accession versions $accessionVersion")
        }
    }

    fun approveProcessedData(
        submitter: String,
        accessionVersionsFilter: List<AccessionVersion>?,
        organism: Organism,
        scope: ApproveDataScope,
    ): List<AccessionVersion> {
        if (accessionVersionsFilter == null) {
            log.info { "approving all sequences by all groups $submitter is member of" }
        } else {
            log.info { "approving ${accessionVersionsFilter.size} sequences by $submitter" }
        }

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        if (accessionVersionsFilter != null) {
            accessionPreconditionValidator.validateAccessionVersions(
                submitter,
                accessionVersionsFilter,
                listOf(Status.AWAITING_APPROVAL, Status.AWAITING_APPROVAL_FOR_REVOCATION),
                organism,
            )
        }

        val view = entriesViewProvider.get(organism)
        val table = entriesTableProvider.get(organism)

        val accessionVersionsToUpdate =
            view.join(
                DataUseTermsTable,
                JoinType.LEFT,
                additionalConstraint = {
                    (view.accessionColumn eq DataUseTermsTable.accessionColumn) and
                        (DataUseTermsTable.isNewestDataUseTerms)
                },
            ).select {
                val statusCondition = view.statusIsOneOf(
                    listOf(Status.AWAITING_APPROVAL, Status.AWAITING_APPROVAL_FOR_REVOCATION),
                )

                val accessionCondition = if (accessionVersionsFilter !== null) {
                    view.accessionVersionIsIn(accessionVersionsFilter)
                } else {
                    view.groupIsOneOf(groupManagementDatabaseService.getGroupsOfUser(submitter))
                }

                val scopeCondition = if (scope == ApproveDataScope.WITHOUT_WARNINGS) {
                    not(view.entriesWithWarnings)
                } else {
                    Op.TRUE
                }

                statusCondition and accessionCondition and scopeCondition
            }.map {
                AccessionVersion(it[view.accessionColumn], it[view.versionColumn])
            }

        table.update(
            where = {
                table.accessionVersionIsIn(accessionVersionsToUpdate)
            },
        ) {
            it[releasedAtColumn] = now
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

    fun streamDataToEdit(
        submitter: String,
        groupName: String,
        numberOfSequenceEntries: Int,
        organism: Organism,
    ): Sequence<SequenceEntryVersionToEdit> {
        log.info { "streaming $numberOfSequenceEntries submissions that need edit by $submitter" }

        groupManagementPreconditionValidator.validateUserInExistingGroup(groupName, submitter)

        entriesViewProvider.get(organism).let { view ->
            return view.slice(
                view.accessionColumn,
                view.versionColumn,
                view.statusColumn,
                view.processedDataColumn,
                view.originalDataColumn,
                view.errorsColumn,
                view.warningsColumn,
            )
                .select(
                    where = {
                        view.statusIs(Status.HAS_ERRORS) and
                            view.isMaxVersion and
                            view.groupIs(groupName) and
                            view.organismIs(organism)
                    },
                )
                .limit(numberOfSequenceEntries)
                .map { row ->
                    SequenceEntryVersionToEdit(
                        row[view.accessionColumn],
                        row[view.versionColumn],
                        Status.fromString(row[view.statusColumn]),
                        row[view.processedDataColumn]!!,
                        row[view.originalDataColumn]!!,
                        row[view.errorsColumn],
                        row[view.warningsColumn],
                    )
                }
                .asSequence()
        }
    }

    fun getSequences(
        username: String,
        organism: Organism?,
        groupsFilter: List<String>?,
        statusesFilter: List<Status>?,
        warningsFilter: WarningsFilter? = null,
        page: Int? = null,
        size: Int? = null,
    ): GetSequenceResponse {
        log.info {
            "getting sequence for user $username (groupFilter: $groupsFilter in statuses $statusesFilter)." +
                " Page $page of size $size "
        }

        val validatedGroupNames = if (groupsFilter == null) {
            groupManagementDatabaseService.getGroupsOfUser(username).map { it.groupName }
        } else {
            groupManagementPreconditionValidator.validateUserInExistingGroups(groupsFilter, username)
            groupsFilter
        }

        val listOfStatuses = statusesFilter ?: Status.entries

        entriesViewProvider.get(organism).let { view ->
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
                    view.organismColumn,
                    view.submittedAtColumn,
                    DataUseTermsTable.dataUseTermsTypeColumn,
                    DataUseTermsTable.restrictedUntilColumn,
                )
                .select(
                    where = {
                        view.groupNameIsOneOf(validatedGroupNames)
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
                            row[view.accessionColumn],
                            row[view.versionColumn],
                            Status.fromString(row[view.statusColumn]),
                            row[view.groupNameColumn],
                            row[view.isRevocationColumn],
                            row[view.submissionIdColumn],
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

    fun revoke(accessions: List<Accession>, username: String, organism: Organism): List<SubmissionIdMapping> {
        log.info { "revoking ${accessions.size} sequences" }

        accessionPreconditionValidator.validateAccessions(
            username,
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
                            view.statusIs(Status.AWAITING_APPROVAL_FOR_REVOCATION)
                    },
                ).map {
                    SubmissionIdMapping(
                        it[view.accessionColumn],
                        it[view.versionColumn],
                        it[view.submissionIdColumn],
                    )
                }.sortedBy { it.accession }
        }
    }

    fun confirmRevocation(accessionVersions: List<AccessionVersion>, username: String, organism: Organism) {
        log.info { "Confirming revocation for ${accessionVersions.size} sequence entries" }

        accessionPreconditionValidator.validateAccessionVersions(
            username,
            accessionVersions,
            listOf(Status.AWAITING_APPROVAL_FOR_REVOCATION),
            organism,
        )

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        entriesTableProvider.get(organism).let { table ->
            table.update(
                where = {
                    table.accessionVersionIsIn(accessionVersions)
                },
            ) {
                it[releasedAtColumn] = now
            }
        }
    }

    fun deleteSequenceEntryVersions(
        accessionVersionsFilter: List<AccessionVersion>?,
        submitter: String,
        organism: Organism,
        scope: DeleteSequenceScope,
    ): List<AccessionVersion> {
        if (accessionVersionsFilter == null) {
            log.info { "deleting all sequences of all groups $submitter is member of in the scope $scope" }
        } else {
            log.info { "deleting ${accessionVersionsFilter.size} sequences by $submitter in scope $scope" }
        }

        val listOfDeletableStatuses = listOf(
            Status.RECEIVED,
            Status.AWAITING_APPROVAL,
            Status.HAS_ERRORS,
            Status.AWAITING_APPROVAL_FOR_REVOCATION,
        )

        if (accessionVersionsFilter != null) {
            accessionPreconditionValidator.validateAccessionVersions(
                submitter,
                accessionVersionsFilter,
                listOfDeletableStatuses,
                organism,
            )
        }

        val sequenceEntriesToDelete = entriesTableProvider.get(organism).let { table ->
            entriesViewProvider.get(organism).let { view ->
                table.join(
                    view,
                    JoinType.INNER,
                    additionalConstraint = {
                        (table.accessionColumn eq view.accessionColumn) and
                            (table.versionColumn eq view.versionColumn)
                    },
                ).select {
                    val accessionCondition = if (accessionVersionsFilter != null) {
                        table.accessionVersionIsIn(accessionVersionsFilter)
                    } else {
                        table.groupIsOneOf(groupManagementDatabaseService.getGroupsOfUser(submitter))
                    }

                    val scopeCondition = when (scope) {
                        DeleteSequenceScope.PROCESSED_WITH_ERRORS -> {
                            view.statusIs(Status.HAS_ERRORS)
                        }
                        DeleteSequenceScope.PROCESSED_WITH_WARNINGS -> {
                            view.statusIs(Status.AWAITING_APPROVAL) and
                                view.entriesWithWarnings
                        }
                        DeleteSequenceScope.ALL -> view.statusIsOneOf(listOfDeletableStatuses)
                    }

                    accessionCondition and scopeCondition
                }.map {
                    AccessionVersion(it[table.accessionColumn], it[table.versionColumn])
                }
            }
        }

        entriesTableProvider.get(organism).deleteWhere {
            accessionVersionIsIn(sequenceEntriesToDelete)
        }

        return sequenceEntriesToDelete
    }

    fun submitEditedData(submitter: String, editedAccessionVersion: UnprocessedData, organism: Organism) {
        log.info { "edited sequence entry submitted $editedAccessionVersion" }

        accessionPreconditionValidator.validateAccessionVersions(
            submitter,
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
        submitter: String,
        accessionVersion: AccessionVersion,
        organism: Organism,
    ): SequenceEntryVersionToEdit {
        log.info {
            "Getting sequence entry ${accessionVersion.displayAccessionVersion()} by $submitter to edit"
        }

        accessionPreconditionValidator.validateAccessionVersions(
            submitter,
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
            )
                .select(
                    where = {
                        view.accessionVersionEquals(accessionVersion)
                    },
                )

            return selectedSequenceEntries.first().let {
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
