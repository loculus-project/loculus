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
import org.jetbrains.exposed.sql.SqlExpressionBuilder.plus
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.booleanParam
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.kotlin.datetime.dateTimeParam
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.stringParam
import org.jetbrains.exposed.sql.update
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsType
import org.loculus.backend.api.Group
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.SequenceEntryStatus
import org.loculus.backend.api.SequenceEntryVersionToEdit
import org.loculus.backend.api.Status
import org.loculus.backend.api.Status.APPROVED_FOR_RELEASE
import org.loculus.backend.api.Status.AWAITING_APPROVAL
import org.loculus.backend.api.Status.AWAITING_APPROVAL_FOR_REVOCATION
import org.loculus.backend.api.Status.HAS_ERRORS
import org.loculus.backend.api.Status.IN_PROCESSING
import org.loculus.backend.api.Status.RECEIVED
import org.loculus.backend.api.SubmissionIdMapping
import org.loculus.backend.api.SubmittedProcessedData
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.controller.BadRequestException
import org.loculus.backend.controller.ProcessingValidationException
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.service.datauseterms.DataUseTermsTable
import org.loculus.backend.service.groupmanagement.GroupManagementDatabaseService
import org.loculus.backend.service.groupmanagement.GroupManagementPreconditionValidator
import org.loculus.backend.service.jsonbParam
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
    private val sequenceEntriesTableProvider: SequenceEntriesTableProvider,
    private val emptyProcessedDataProvider: EmptyProcessedDataProvider,
) {

    init {
        Database.connect(pool)
    }

    fun streamUnprocessedSubmissions(numberOfSequenceEntries: Int, organism: Organism): Sequence<UnprocessedData> {
        log.info { "streaming unprocessed submissions. Requested $numberOfSequenceEntries sequence entries." }

        sequenceEntriesTableProvider.get(organism).let { table ->
            val sequenceEntryData = table
                .slice(table.accessionColumn, table.versionColumn, table.originalDataColumn)
                .select(
                    where = { table.statusIs(RECEIVED) and table.isMaxVersion and table.organismIs(organism) },
                )
                .limit(numberOfSequenceEntries)
                .map {
                    UnprocessedData(
                        it[table.accessionColumn],
                        it[table.versionColumn],
                        it[table.originalDataColumn]!!,
                    )
                }

            log.info {
                "streaming ${sequenceEntryData.size} of $numberOfSequenceEntries requested unprocessed submissions"
            }

            updateStatusToProcessing(sequenceEntryData, table)

            return sequenceEntryData.asSequence()
        }
    }

    private fun updateStatusToProcessing(sequenceEntries: List<UnprocessedData>, table: SequenceEntriesDataTable) {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        table.update(
            where = { table.accessionVersionIsIn(sequenceEntries) },
        ) {
            it[statusColumn] = IN_PROCESSING.name
            it[startedProcessingAtColumn] = now
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

            val numInserted = insertProcessedDataWithStatus(submittedProcessedData, organism)
            if (numInserted != 1) {
                throwInsertFailedException(submittedProcessedData, organism)
            }
        }
    }

    private fun insertProcessedDataWithStatus(
        submittedProcessedData: SubmittedProcessedData,
        organism: Organism,
    ): Int {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val submittedErrors = submittedProcessedData.errors.orEmpty()
        val submittedWarnings = submittedProcessedData.warnings.orEmpty()

        val (newStatus, processedData) = when {
            submittedErrors.isEmpty() -> AWAITING_APPROVAL to validateProcessedData(submittedProcessedData, organism)
            else -> HAS_ERRORS to submittedProcessedData.data
        }

        return sequenceEntriesTableProvider.get(organism).let { table ->
            table.update(
                where = {
                    table.accessionVersionEquals(submittedProcessedData) and
                        table.statusIs(IN_PROCESSING) and
                        table.organismIs(organism)
                },
            ) {
                it[statusColumn] = newStatus.name
                it[processedDataColumn] = processedData
                it[errorsColumn] = submittedErrors
                it[warningsColumn] = submittedWarnings
                it[finishedProcessingAtColumn] = now
            }
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
        sequenceEntriesTableProvider.get(organism).let { table ->
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
        sequenceEntriesTableProvider.get(organism).let { table ->
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
            if (selectedSequence[table.statusColumn] != IN_PROCESSING.name) {
                throw UnprocessableEntityException(
                    "Accession version $accessionVersion is in not in state $IN_PROCESSING " +
                        "(was ${selectedSequence[table.statusColumn]})",
                )
            }

            throw RuntimeException("Update processed data: Unexpected error for accession versions $accessionVersion")
        }
    }

    fun approveProcessedData(submitter: String, accessionVersions: List<AccessionVersion>, organism: Organism) {
        log.info { "approving ${accessionVersions.size} sequences by $submitter" }

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        accessionPreconditionValidator.validateAccessionVersions(
            submitter,
            accessionVersions,
            listOf(AWAITING_APPROVAL),
            organism,
        )

        sequenceEntriesTableProvider.get(organism).let { table ->
            table.update(
                where = {
                    table.accessionVersionIsIn(accessionVersions) and table.statusIs(AWAITING_APPROVAL)
                },
            ) {
                it[statusColumn] = APPROVED_FOR_RELEASE.name
                it[releasedAtColumn] = now
            }
        }
    }

    fun getLatestVersions(organism: Organism): Map<Accession, Version> {
        sequenceEntriesTableProvider.get(organism).let { table ->
            val maxVersionExpression = table.versionColumn.max()
            return table
                .slice(table.accessionColumn, maxVersionExpression)
                .select(
                    where = { table.statusIs(APPROVED_FOR_RELEASE) and table.organismIs(organism) },
                )
                .groupBy(table.accessionColumn)
                .associate { it[table.accessionColumn] to it[maxVersionExpression]!! }
        }
    }

    fun getLatestRevocationVersions(organism: Organism): Map<Accession, Version> {
        sequenceEntriesTableProvider.get(organism).let { table ->
            val maxVersionExpression = table.versionColumn.max()
            return table
                .slice(table.accessionColumn, maxVersionExpression)
                .select(
                    where = {
                        table.statusIs(APPROVED_FOR_RELEASE) and
                            (table.isRevocationColumn eq true) and
                            table.organismIs(organism)
                    },
                )
                .groupBy(table.accessionColumn)
                .associate { it[table.accessionColumn] to it[maxVersionExpression]!! }
        }
    }

    fun streamReleasedSubmissions(organism: Organism): Sequence<RawProcessedData> {
        return sequenceEntriesTableProvider.get(organism).let { table ->

            table.join(DataUseTermsTable, JoinType.LEFT, additionalConstraint = {
                (table.accessionColumn eq DataUseTermsTable.accessionColumn) and
                    (DataUseTermsTable.isNewestDataUseTerms)
            })
                .slice(
                    table.accessionColumn,
                    table.versionColumn,
                    table.isRevocationColumn,
                    table.processedDataColumn,
                    table.submitterColumn,
                    table.groupNameColumn,
                    table.submittedAtColumn,
                    table.releasedAtColumn,
                    table.submissionIdColumn,
                    DataUseTermsTable.dataUseTermsTypeColumn,
                    DataUseTermsTable.restrictedUntilColumn,
                )
                .select(
                    where = { table.statusIs(APPROVED_FOR_RELEASE) and table.organismIs(organism) },
                )
                .map {
                    RawProcessedData(
                        accession = it[table.accessionColumn],
                        version = it[table.versionColumn],
                        isRevocation = it[table.isRevocationColumn],
                        submitter = it[table.submitterColumn],
                        group = it[table.groupNameColumn],
                        submissionId = it[table.submissionIdColumn],
                        processedData = it[table.processedDataColumn]!!,
                        submittedAt = it[table.submittedAtColumn],
                        releasedAt = it[table.releasedAtColumn]!!,
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

        groupManagementPreconditionValidator.validateUserInExistingGroupAndReturnUserList(groupName, submitter)

        sequenceEntriesTableProvider.get(organism).let { table ->
            return table.slice(
                table.accessionColumn,
                table.versionColumn,
                table.statusColumn,
                table.processedDataColumn,
                table.originalDataColumn,
                table.errorsColumn,
                table.warningsColumn,
            )
                .select(
                    where = {
                        table.statusIs(HAS_ERRORS) and
                            table.isMaxVersion and
                            table.groupIs(groupName) and
                            table.organismIs(organism)
                    },
                )
                .limit(numberOfSequenceEntries)
                .map { row ->
                    SequenceEntryVersionToEdit(
                        row[table.accessionColumn],
                        row[table.versionColumn],
                        Status.fromString(row[table.statusColumn]),
                        row[table.processedDataColumn]!!,
                        row[table.originalDataColumn]!!,
                        row[table.errorsColumn],
                        row[table.warningsColumn],
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
    ): List<SequenceEntryStatus> {
        log.info { "getting sequence for user $username (groupFilter: $groupsFilter in statuses $statusesFilter" }

        val validatedGroupNames = if (groupsFilter === null) {
            groupManagementDatabaseService.getGroupsOfUser(username)
        } else {
            groupManagementPreconditionValidator.validateUserInExistingGroups(groupsFilter, username)
            groupsFilter.map { Group(it) }
        }

        val listOfStatuses = statusesFilter ?: Status.entries

        sequenceEntriesTableProvider.get(organism).let { table ->
            val query = table
                .join(DataUseTermsTable, JoinType.LEFT, additionalConstraint = {
                    (table.accessionColumn eq DataUseTermsTable.accessionColumn) and
                        (DataUseTermsTable.isNewestDataUseTerms)
                })
                .slice(
                    table.accessionColumn,
                    table.versionColumn,
                    table.submissionIdColumn,
                    table.statusColumn,
                    table.isRevocationColumn,
                    table.groupNameColumn,
                    table.organismColumn,
                    table.submittedAtColumn,
                    DataUseTermsTable.dataUseTermsTypeColumn,
                    DataUseTermsTable.restrictedUntilColumn,
                )
                .select(
                    where = {
                        table.statusIsOneOf(listOfStatuses) and
                            table.groupIsOneOf(validatedGroupNames)
                    },
                )

            if (organism != null) {
                query.andWhere { table.organismIs(organism) }
            }

            return query
                .sortedBy { it[table.submittedAtColumn] }
                .map { row ->
                    SequenceEntryStatus(
                        row[table.accessionColumn],
                        row[table.versionColumn],
                        Status.fromString(row[table.statusColumn]),
                        row[table.groupNameColumn],
                        row[table.isRevocationColumn],
                        row[table.submissionIdColumn],
                        dataUseTerms = DataUseTerms.fromParameters(
                            DataUseTermsType.fromString(row[DataUseTermsTable.dataUseTermsTypeColumn]),
                            row[DataUseTermsTable.restrictedUntilColumn],
                        ),
                    )
                }
        }
    }

    fun revoke(accessions: List<Accession>, username: String, organism: Organism): List<SubmissionIdMapping> {
        log.info { "revoking ${accessions.size} sequences" }

        accessionPreconditionValidator.validateAccessions(
            username,
            accessions,
            listOf(APPROVED_FOR_RELEASE),
            organism,
        )

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)
        sequenceEntriesTableProvider.get(organism).let { table ->
            table.insert(
                table.slice(
                    table.accessionColumn,
                    table.versionColumn.plus(1),
                    table.submissionIdColumn,
                    table.submitterColumn,
                    table.groupNameColumn,
                    dateTimeParam(now),
                    stringParam(AWAITING_APPROVAL_FOR_REVOCATION.name),
                    booleanParam(true),
                    table.organismColumn,
                    jsonbParam(emptyProcessedDataProvider.provide(organism)),
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
                    table.statusColumn,
                    table.isRevocationColumn,
                    table.organismColumn,
                    table.processedDataColumn,
                ),
            )

            return table
                .slice(
                    table.accessionColumn,
                    table.versionColumn,
                    table.isRevocationColumn,
                    table.groupNameColumn,
                    table.submissionIdColumn,
                )
                .select(
                    where = {
                        (table.accessionColumn inList accessions) and
                            table.isMaxVersion and
                            table.statusIs(AWAITING_APPROVAL_FOR_REVOCATION)
                    },
                ).map {
                    SubmissionIdMapping(
                        it[table.accessionColumn],
                        it[table.versionColumn],
                        it[table.submissionIdColumn],
                    )
                }.sortedBy { it.accession }
        }
    }

    fun confirmRevocation(accessionVersions: List<AccessionVersion>, username: String, organism: Organism) {
        log.info { "Confirming revocation for ${accessionVersions.size} sequence entries" }

        accessionPreconditionValidator.validateAccessionVersions(
            username,
            accessionVersions,
            listOf(AWAITING_APPROVAL_FOR_REVOCATION),
            organism,
        )

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        sequenceEntriesTableProvider.get(organism).let { table ->
            table.update(
                where = {
                    table.accessionVersionIsIn(accessionVersions) and table.statusIs(
                        AWAITING_APPROVAL_FOR_REVOCATION,
                    )
                },
            ) {
                it[statusColumn] = APPROVED_FOR_RELEASE.name
                it[releasedAtColumn] = now
            }
        }
    }

    fun deleteSequenceEntryVersions(accessionVersions: List<AccessionVersion>, submitter: String, organism: Organism) {
        log.info { "Deleting accession versions: $accessionVersions" }

        accessionPreconditionValidator.validateAccessionVersions(
            submitter,
            accessionVersions,
            listOf(RECEIVED, AWAITING_APPROVAL, HAS_ERRORS, AWAITING_APPROVAL_FOR_REVOCATION),
            organism,
        )

        sequenceEntriesTableProvider.get(organism).deleteWhere {
            accessionVersionIsIn(accessionVersions)
        }
    }

    fun submitEditedData(submitter: String, editedAccessionVersion: UnprocessedData, organism: Organism) {
        log.info { "edited sequence entry submitted $editedAccessionVersion" }

        accessionPreconditionValidator.validateAccessionVersions(
            submitter,
            listOf(editedAccessionVersion),
            listOf(AWAITING_APPROVAL, HAS_ERRORS),
            organism,
        )

        sequenceEntriesTableProvider.get(organism).let { table ->
            table.update(
                where = {
                    table.accessionVersionEquals(editedAccessionVersion)
                },
            ) {
                it[statusColumn] = RECEIVED.name
                it[originalDataColumn] = editedAccessionVersion.data
                it[errorsColumn] = null
                it[warningsColumn] = null
                it[startedProcessingAtColumn] = null
                it[finishedProcessingAtColumn] = null
                it[processedDataColumn] = null
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
            listOf(HAS_ERRORS, AWAITING_APPROVAL),
            organism,
        )

        sequenceEntriesTableProvider.get(organism).let { table ->
            val selectedSequenceEntries = table.slice(
                table.accessionColumn,
                table.versionColumn,
                table.statusColumn,
                table.processedDataColumn,
                table.originalDataColumn,
                table.errorsColumn,
                table.warningsColumn,
            )
                .select(
                    where = {
                        table.accessionVersionEquals(accessionVersion)
                    },
                )

            return selectedSequenceEntries.first().let {
                SequenceEntryVersionToEdit(
                    it[table.accessionColumn],
                    it[table.versionColumn],
                    Status.fromString(it[table.statusColumn]),
                    it[table.processedDataColumn]!!,
                    it[table.originalDataColumn]!!,
                    it[table.errorsColumn],
                    it[table.warningsColumn],
                )
            }
        }
    }

    fun cleanUpStaleSequencesInProcessing(timeToStaleInSeconds: Long) {
        val staleDateTime = Instant.fromEpochMilliseconds(
            Clock.System.now().toEpochMilliseconds() - timeToStaleInSeconds * 1000,
        ).toLocalDateTime(TimeZone.UTC)

        sequenceEntriesTableProvider.get(organism = null).let { table ->
            val staleSequences = table
                .slice(table.accessionColumn, table.versionColumn)
                .select(
                    where = {
                        table.statusIs(IN_PROCESSING) and
                            table.startedProcessingAtColumn.less(
                                staleDateTime,
                            )
                    },
                )
                .map { AccessionVersion(it[table.accessionColumn], it[table.versionColumn]) }

            if (staleSequences.isNotEmpty()) {
                log.info { "Cleaning up ${staleSequences.size} stale sequences in processing" }
                table.update(
                    where = {
                        table.accessionVersionIsIn(staleSequences) and table.statusIs(IN_PROCESSING)
                    },
                ) {
                    it[statusColumn] = RECEIVED.name
                    it[startedProcessingAtColumn] = null
                }
            } else {
                log.info { "No stale sequences in processing to clean up" }
            }
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
