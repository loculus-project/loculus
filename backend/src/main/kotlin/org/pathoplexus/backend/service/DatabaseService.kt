package org.pathoplexus.backend.service

import com.fasterxml.jackson.core.JacksonException
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.QueryParameter
import org.jetbrains.exposed.sql.SqlExpressionBuilder.plus
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.booleanParam
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.kotlin.datetime.dateTimeParam
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.stringParam
import org.jetbrains.exposed.sql.update
import org.pathoplexus.backend.api.AccessionVersion
import org.pathoplexus.backend.api.AccessionVersionInterface
import org.pathoplexus.backend.api.Organism
import org.pathoplexus.backend.api.ProcessedData
import org.pathoplexus.backend.api.RevisedData
import org.pathoplexus.backend.api.SequenceEntryStatus
import org.pathoplexus.backend.api.SequenceEntryVersionToEdit
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.api.Status.APPROVED_FOR_RELEASE
import org.pathoplexus.backend.api.Status.AWAITING_APPROVAL
import org.pathoplexus.backend.api.Status.AWAITING_APPROVAL_FOR_REVOCATION
import org.pathoplexus.backend.api.Status.HAS_ERRORS
import org.pathoplexus.backend.api.Status.IN_PROCESSING
import org.pathoplexus.backend.api.Status.RECEIVED
import org.pathoplexus.backend.api.SubmissionIdMapping
import org.pathoplexus.backend.api.SubmittedProcessedData
import org.pathoplexus.backend.api.UnprocessedData
import org.pathoplexus.backend.config.ReferenceGenome
import org.pathoplexus.backend.controller.BadRequestException
import org.pathoplexus.backend.controller.ForbiddenException
import org.pathoplexus.backend.controller.NotFoundException
import org.pathoplexus.backend.controller.ProcessingValidationException
import org.pathoplexus.backend.controller.UnprocessableEntityException
import org.pathoplexus.backend.utils.Accession
import org.pathoplexus.backend.utils.IteratorStreamer
import org.pathoplexus.backend.utils.Version
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import javax.sql.DataSource

private val log = KotlinLogging.logger { }

@Service
@Transactional
class DatabaseService(
    private val sequenceValidatorFactory: SequenceValidatorFactory,
    private val queryPreconditionValidator: QueryPreconditionValidator,
    private val objectMapper: ObjectMapper,
    pool: DataSource,
    private val referenceGenome: ReferenceGenome,
    private val iteratorStreamer: IteratorStreamer,
    private val sequenceEntriesTableProvider: SequenceEntriesTableProvider,
) {

    init {
        Database.connect(pool)
    }

    fun streamUnprocessedSubmissions(numberOfSequenceEntries: Int, outputStream: OutputStream, organism: Organism) {
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

            iteratorStreamer.streamAsNdjson(sequenceEntryData, outputStream)
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

        if (submittedErrors.isEmpty()) {
            try {
                sequenceValidatorFactory.create(organism).validateSequence(submittedProcessedData)
            } catch (validationException: ProcessingValidationException) {
                throwIfIsSubmissionForWrongOrganism(submittedProcessedData, organism)
                throw validationException
            }
        }

        val submittedWarnings = submittedProcessedData.warnings.orEmpty()
        val submittedProcessedDataWithAllKeysForInsertions = addMissingKeysForInsertions(submittedProcessedData)

        val newStatus = when {
            submittedErrors.isEmpty() -> AWAITING_APPROVAL
            else -> HAS_ERRORS
        }

        return sequenceEntriesTableProvider.get(organism).let { table ->
            table.update(
                where = {
                    table.accessionVersionEquals(submittedProcessedDataWithAllKeysForInsertions) and
                        table.statusIs(IN_PROCESSING) and
                        table.organismIs(organism)
                },
            ) {
                it[statusColumn] = newStatus.name
                it[processedDataColumn] = submittedProcessedDataWithAllKeysForInsertions.data
                it[errorsColumn] = submittedErrors
                it[warningsColumn] = submittedWarnings
                it[finishedProcessingAtColumn] = now
            }
        }
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

    private fun addMissingKeysForInsertions(submittedProcessedData: SubmittedProcessedData): SubmittedProcessedData {
        val nucleotideInsertions = referenceGenome.nucleotideSequences.associate {
            if (it.name in submittedProcessedData.data.nucleotideInsertions.keys) {
                it.name to submittedProcessedData.data.nucleotideInsertions[it.name]!!
            } else {
                (it.name to emptyList())
            }
        }

        val aminoAcidInsertions = referenceGenome.genes.associate {
            if (it.name in submittedProcessedData.data.aminoAcidInsertions.keys) {
                it.name to submittedProcessedData.data.aminoAcidInsertions[it.name]!!
            } else {
                (it.name to emptyList())
            }
        }

        return submittedProcessedData.copy(
            data = submittedProcessedData.data.copy(
                nucleotideInsertions = nucleotideInsertions,
                aminoAcidInsertions = aminoAcidInsertions,
            ),
        )
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

        queryPreconditionValidator.validateAccessionVersions(
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
            table.slice(
                table.accessionColumn,
                table.versionColumn,
                table.isRevocationColumn,
                table.processedDataColumn,
                table.submitterColumn,
                table.submittedAtColumn,
                table.submissionIdColumn,
            )
                .select(
                    where = { table.statusIs(APPROVED_FOR_RELEASE) and table.organismIs(organism) },
                )
                // TODO(#429): This needs clarification of how to handle revocations. Until then, revocations are filtered out.
                .filter { !it[table.isRevocationColumn] }
                .map {
                    RawProcessedData(
                        accession = it[table.accessionColumn],
                        version = it[table.versionColumn],
                        isRevocation = it[table.isRevocationColumn],
                        submitter = it[table.submitterColumn],
                        submissionId = it[table.submissionIdColumn],
                        processedData = it[table.processedDataColumn]!!,
                        submittedAt = it[table.submittedAtColumn],
                    )
                }
                .asSequence()
        }
    }

    fun streamDataToEdit(
        submitter: String,
        numberOfSequenceEntries: Int,
        outputStream: OutputStream,
        organism: Organism,
    ) {
        log.info { "streaming $numberOfSequenceEntries submissions that need edit by $submitter" }
        val sequencesData = sequenceEntriesTableProvider.get(organism).let { table ->
            table.slice(
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
                            table.submitterIs(submitter) and
                            table.organismIs(organism)
                    },
                ).limit(numberOfSequenceEntries).map { row ->
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
        }

        iteratorStreamer.streamAsNdjson(sequencesData, outputStream)
    }

    fun getActiveSequencesSubmittedBy(username: String, organism: Organism): List<SequenceEntryStatus> {
        log.info { "getting active sequence entries submitted by $username" }

        sequenceEntriesTableProvider.get(organism).let { table ->
            val subTableSequenceStatus = table
                .slice(
                    table.accessionColumn,
                    table.versionColumn,
                    table.statusColumn,
                    table.isRevocationColumn,
                    table.organismColumn,
                )

            val releasedSequenceEntries = subTableSequenceStatus
                .select(
                    where = {
                        table.statusIs(APPROVED_FOR_RELEASE) and
                            table.submitterIs(username) and
                            table.isMaxReleasedVersion and
                            table.organismIs(organism)
                    },
                ).map { row ->
                    SequenceEntryStatus(
                        row[table.accessionColumn],
                        row[table.versionColumn],
                        APPROVED_FOR_RELEASE,
                        row[table.isRevocationColumn],
                    )
                }

            val unreleasedSequenceEntries = subTableSequenceStatus.select(
                where = {
                    (table.statusColumn neq APPROVED_FOR_RELEASE.name) and
                        table.submitterIs(username) and
                        table.isMaxVersion and
                        table.organismIs(organism)
                },
            ).map { row ->
                SequenceEntryStatus(
                    row[table.accessionColumn],
                    row[table.versionColumn],
                    Status.fromString(row[table.statusColumn]),
                    row[table.isRevocationColumn],
                )
            }

            return releasedSequenceEntries + unreleasedSequenceEntries
        }
    }

    fun reviseData(submitter: String, revisedData: List<RevisedData>, organism: Organism): List<SubmissionIdMapping> {
        log.info { "revising sequence entries" }

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val accessionVersions =
            queryPreconditionValidator.validateAccessions(
                submitter,
                revisedData.map { it.accession },
                listOf(APPROVED_FOR_RELEASE),
                organism,
            ).associateBy { it.accession }

        revisedData.map { data ->
            sequenceEntriesTableProvider.get(organism).let { table ->
                table.insert(
                    table.slice(
                        table.accessionColumn,
                        table.versionColumn.plus(1),
                        table.submissionIdColumn,
                        table.submitterColumn,
                        dateTimeParam(now),
                        stringParam(RECEIVED.name),
                        booleanParam(false),
                        QueryParameter(data.originalData, table.originalDataColumn.columnType),
                        table.organismColumn,
                    ).select(
                        where = {
                            (table.accessionColumn eq data.accession) and
                                table.isMaxVersion and
                                table.statusIs(APPROVED_FOR_RELEASE) and
                                table.submitterIs(submitter)
                        },
                    ),
                    columns = listOf(
                        table.accessionColumn,
                        table.versionColumn,
                        table.submissionIdColumn,
                        table.submitterColumn,
                        table.submittedAtColumn,
                        table.statusColumn,
                        table.isRevocationColumn,
                        table.originalDataColumn,
                        table.organismColumn,
                    ),
                )
            }
        }

        return revisedData.map {
            SubmissionIdMapping(it.accession, accessionVersions[it.accession]!!.version + 1, it.submissionId)
        }
    }

    fun revoke(accessions: List<Accession>, username: String, organism: Organism): List<SequenceEntryStatus> {
        log.info { "revoking ${accessions.size} sequences" }

        queryPreconditionValidator.validateAccessions(
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
                    dateTimeParam(now),
                    stringParam(AWAITING_APPROVAL_FOR_REVOCATION.name),
                    booleanParam(true),
                    table.organismColumn,
                ).select(
                    where = {
                        (table.accessionColumn inList accessions) and
                            table.isMaxVersion and
                            table.statusIs(APPROVED_FOR_RELEASE)
                    },
                ),
                columns = listOf(
                    table.accessionColumn,
                    table.versionColumn,
                    table.submissionIdColumn,
                    table.submitterColumn,
                    table.submittedAtColumn,
                    table.statusColumn,
                    table.isRevocationColumn,
                    table.organismColumn,
                ),
            )

            return table
                .slice(
                    table.accessionColumn,
                    table.versionColumn,
                    table.isRevocationColumn,
                )
                .select(
                    where = {
                        (table.accessionColumn inList accessions) and
                            table.isMaxVersion and
                            table.statusIs(AWAITING_APPROVAL_FOR_REVOCATION)
                    },
                ).map {
                    SequenceEntryStatus(
                        it[table.accessionColumn],
                        it[table.versionColumn],
                        AWAITING_APPROVAL_FOR_REVOCATION,
                        it[table.isRevocationColumn],
                    )
                }
        }
    }

    fun confirmRevocation(accessionVersions: List<AccessionVersion>, username: String, organism: Organism) {
        log.info { "Confirming revocation for ${accessionVersions.size} sequence entries" }

        queryPreconditionValidator.validateAccessionVersions(
            username,
            accessionVersions,
            listOf(AWAITING_APPROVAL_FOR_REVOCATION),
            organism,
        )

        sequenceEntriesTableProvider.get(organism).let { table ->
            table.update(
                where = {
                    table.accessionVersionIsIn(accessionVersions) and table.statusIs(
                        AWAITING_APPROVAL_FOR_REVOCATION,
                    )
                },
            ) {
                it[statusColumn] = APPROVED_FOR_RELEASE.name
            }
        }
    }

    fun deleteSequenceEntryVersions(accessionVersions: List<AccessionVersion>, submitter: String, organism: Organism) {
        log.info { "Deleting accession versions: $accessionVersions" }

        queryPreconditionValidator.validateAccessionVersions(
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

        sequenceEntriesTableProvider.get(organism).let { table ->
            val sequencesEdited = table.update(
                where = {
                    table.accessionVersionEquals(editedAccessionVersion) and
                        table.submitterIs(submitter) and
                        table.statusIsOneOf(AWAITING_APPROVAL, HAS_ERRORS) and
                        table.organismIs(organism)
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

            if (sequencesEdited != 1) {
                handleEditedSubmissionError(editedAccessionVersion, submitter, organism)
            }
        }
    }

    private fun handleEditedSubmissionError(
        editedAccessionVersion: UnprocessedData,
        submitter: String,
        organism: Organism,
    ) {
        sequenceEntriesTableProvider.get(organism).let { table ->
            val selectedSequences = table
                .slice(
                    table.accessionColumn,
                    table.versionColumn,
                    table.statusColumn,
                    table.submitterColumn,
                    table.organismColumn,
                )
                .select(where = { table.accessionVersionEquals(editedAccessionVersion) })

            val accessionVersionString = editedAccessionVersion.displayAccessionVersion()

            if (selectedSequences.count().toInt() == 0) {
                throw UnprocessableEntityException("Sequence entry $accessionVersionString does not exist")
            }

            val queriedSequence = selectedSequences.first()

            val hasCorrectStatus = queriedSequence[table.statusColumn] == AWAITING_APPROVAL.name ||
                queriedSequence[table.statusColumn] == HAS_ERRORS.name
            if (!hasCorrectStatus) {
                val status = queriedSequence[table.statusColumn]
                throw UnprocessableEntityException(
                    "Sequence entry $accessionVersionString is in status $status, " +
                        "not in $AWAITING_APPROVAL or $HAS_ERRORS",
                )
            }

            if (queriedSequence[table.submitterColumn] != submitter) {
                throw ForbiddenException(
                    "Sequence entry $accessionVersionString is not owned by user $submitter",
                )
            }

            if (queriedSequence[table.organismColumn] != organism.name) {
                throw UnprocessableEntityException(
                    "Sequence entry $accessionVersionString is for organism " +
                        "${queriedSequence[table.organismColumn]}, but submitted data is for organism " +
                        organism.name,
                )
            }

            throw Exception("SequenceEdit: Unknown error")
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

        val dataTable = sequenceEntriesTableProvider.get(organism)
        dataTable.let { table ->
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
                        table.statusIsOneOf(HAS_ERRORS, AWAITING_APPROVAL) and
                            table.accessionVersionEquals(accessionVersion) and
                            table.submitterIs(submitter) and
                            table.organismIs(organism)
                    },
                )

            if (selectedSequenceEntries.count().toInt() != 1) {
                handleGetSequenceEntryVersionWithErrorsDataError(submitter, accessionVersion, organism)
            }

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

    private fun handleGetSequenceEntryVersionWithErrorsDataError(
        submitter: String,
        accessionVersion: AccessionVersion,
        organism: Organism,
    ): Nothing {
        sequenceEntriesTableProvider.get(organism).let { table ->
            val selectedSequences = table
                .slice(
                    table.accessionColumn,
                    table.versionColumn,
                    table.statusColumn,
                    table.organismColumn,
                )
                .select(where = { table.accessionVersionEquals(accessionVersion) })

            if (selectedSequences.count().toInt() == 0) {
                throw NotFoundException(
                    "Accession version ${accessionVersion.displayAccessionVersion()} does not exist",
                )
            }

            val selectedSequence = selectedSequences.first()

            val hasCorrectStatus =
                (selectedSequence[table.statusColumn] == AWAITING_APPROVAL.name) ||
                    (selectedSequence[table.statusColumn] == HAS_ERRORS.name)

            if (!hasCorrectStatus) {
                throw UnprocessableEntityException(
                    "Accession version ${accessionVersion.displayAccessionVersion()} is in not in state " +
                        "${HAS_ERRORS.name} or ${AWAITING_APPROVAL.name} " +
                        "(was ${selectedSequence[table.statusColumn]})",
                )
            }

            if (!hasPermissionToChange(submitter, accessionVersion, table)) {
                throw ForbiddenException(
                    "Sequence entry ${accessionVersion.displayAccessionVersion()} is not owned by user $submitter",
                )
            }

            if (selectedSequence[table.organismColumn] != organism.name) {
                throw UnprocessableEntityException(
                    "Accession version ${accessionVersion.displayAccessionVersion()} is for organism " +
                        selectedSequence[table.organismColumn] +
                        ", but requested data for organism ${organism.name}",
                )
            }

            throw RuntimeException(
                "Get edited data: Unexpected error for accession version ${accessionVersion.displayAccessionVersion()}",
            )
        }
    }

    private fun hasPermissionToChange(
        user: String,
        accessionVersion: AccessionVersion,
        table: SequenceEntriesDataTable,
    ): Boolean {
        val sequencesOwnedByUser = table
            .slice(table.accessionColumn, table.versionColumn, table.submitterColumn)
            .select(
                where = { table.accessionVersionEquals(accessionVersion) and table.submitterIs(user) },
            )

        return sequencesOwnedByUser.count() == 1L
    }
}

data class RawProcessedData(
    override val accession: Accession,
    override val version: Version,
    val isRevocation: Boolean,
    val submitter: String,
    val submittedAt: LocalDateTime,
    val submissionId: String,
    val processedData: ProcessedData,
) : AccessionVersionInterface
