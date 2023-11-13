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
import org.jetbrains.exposed.sql.Expression
import org.jetbrains.exposed.sql.NextVal
import org.jetbrains.exposed.sql.QueryParameter
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.SqlExpressionBuilder.plus
import org.jetbrains.exposed.sql.alias
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.booleanParam
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.kotlin.datetime.dateTimeParam
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.nextLongVal
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.stringParam
import org.jetbrains.exposed.sql.update
import org.jetbrains.exposed.sql.wrapAsExpression
import org.pathoplexus.backend.api.AccessionVersion
import org.pathoplexus.backend.api.AccessionVersionInterface
import org.pathoplexus.backend.api.ProcessedData
import org.pathoplexus.backend.api.RevisedData
import org.pathoplexus.backend.api.SequenceEntryReview
import org.pathoplexus.backend.api.SequenceEntryStatus
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.api.Status.APPROVED_FOR_RELEASE
import org.pathoplexus.backend.api.Status.AWAITING_APPROVAL
import org.pathoplexus.backend.api.Status.AWAITING_APPROVAL_FOR_REVOCATION
import org.pathoplexus.backend.api.Status.HAS_ERRORS
import org.pathoplexus.backend.api.Status.IN_PROCESSING
import org.pathoplexus.backend.api.Status.RECEIVED
import org.pathoplexus.backend.api.SubmissionIdMapping
import org.pathoplexus.backend.api.SubmittedData
import org.pathoplexus.backend.api.SubmittedProcessedData
import org.pathoplexus.backend.api.UnprocessedData
import org.pathoplexus.backend.api.toPairs
import org.pathoplexus.backend.config.ReferenceGenome
import org.pathoplexus.backend.controller.BadRequestException
import org.pathoplexus.backend.controller.ForbiddenException
import org.pathoplexus.backend.controller.NotFoundException
import org.pathoplexus.backend.controller.UnprocessableEntityException
import org.pathoplexus.backend.utils.IteratorStreamer
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
    private val sequenceValidator: SequenceValidator,
    private val queryPreconditionValidator: QueryPreconditionValidator,
    private val objectMapper: ObjectMapper,
    pool: DataSource,
    private val referenceGenome: ReferenceGenome,
    private val iteratorStreamer: IteratorStreamer,
) {
    init {
        Database.connect(pool)
    }

    fun insertSubmissions(submitter: String, submittedData: List<SubmittedData>): List<SubmissionIdMapping> {
        log.info { "submitting ${submittedData.size} new sequence entries by $submitter" }

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        return submittedData.map { data ->
            val insert = SequenceEntriesTable.insert {
                it[accession] = accessionSequence.nextLongVal() as NextVal<String>
                it[SequenceEntriesTable.submitter] = submitter
                it[submittedAt] = now
                it[version] = 1
                it[status] = RECEIVED.name
                it[submissionId] = data.submissionId
                it[originalData] = data.originalData
            }
            SubmissionIdMapping(
                insert[SequenceEntriesTable.accession],
                insert[SequenceEntriesTable.version],
                data.submissionId,
            )
        }
    }

    fun streamUnprocessedSubmissions(numberOfSequenceEntries: Int, outputStream: OutputStream) {
        log.info { "streaming unprocessed submissions. Requested $numberOfSequenceEntries sequence entries." }
        val maxVersionQuery = maxVersionQuery()

        val sequenceEntryData = SequenceEntriesTable
            .slice(SequenceEntriesTable.accession, SequenceEntriesTable.version, SequenceEntriesTable.originalData)
            .select(
                where = {
                    (SequenceEntriesTable.status eq RECEIVED.name)
                        .and((SequenceEntriesTable.version eq maxVersionQuery))
                },
            )
            .limit(numberOfSequenceEntries)
            .map {
                UnprocessedData(
                    it[SequenceEntriesTable.accession],
                    it[SequenceEntriesTable.version],
                    it[SequenceEntriesTable.originalData]!!,
                )
            }

        log.info { "streaming ${sequenceEntryData.size} of $numberOfSequenceEntries requested unprocessed submissions" }

        updateStatusToProcessing(sequenceEntryData)

        iteratorStreamer.streamAsNdjson(sequenceEntryData, outputStream)
    }

    private fun updateStatusToProcessing(sequenceEntries: List<UnprocessedData>) {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)
        SequenceEntriesTable
            .update(
                where = { accessionVersionIsIn(sequenceEntries) },
            ) {
                it[status] = IN_PROCESSING.name
                it[startedProcessingAt] = now
            }
    }

    fun updateProcessedData(inputStream: InputStream) {
        log.info { "updating processed data" }
        val reader = BufferedReader(InputStreamReader(inputStream))

        reader.lineSequence().forEach { line ->
            val submittedProcessedData = try {
                objectMapper.readValue<SubmittedProcessedData>(line)
            } catch (e: JacksonException) {
                throw BadRequestException("Failed to deserialize NDJSON line: ${e.message}", e)
            }

            val numInserted = insertProcessedDataWithStatus(submittedProcessedData)
            if (numInserted != 1) {
                throwInsertFailedException(submittedProcessedData)
            }
        }
    }

    private fun insertProcessedDataWithStatus(
        submittedProcessedData: SubmittedProcessedData,
    ): Int {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val submittedErrors = submittedProcessedData.errors.orEmpty()

        if (submittedErrors.isEmpty()) {
            sequenceValidator.validateSequence(submittedProcessedData)
        }

        val submittedWarnings = submittedProcessedData.warnings.orEmpty()
        val submittedProcessedDataWithAllKeysForInsertions = addMissingKeysForInsertions(submittedProcessedData)

        val newStatus = when {
            submittedErrors.isEmpty() -> AWAITING_APPROVAL
            else -> HAS_ERRORS
        }

        return SequenceEntriesTable.update(
            where = {
                (SequenceEntriesTable.accession eq submittedProcessedDataWithAllKeysForInsertions.accession) and
                    (SequenceEntriesTable.version eq submittedProcessedDataWithAllKeysForInsertions.version) and
                    (SequenceEntriesTable.status eq IN_PROCESSING.name)
            },
        ) {
            it[status] = newStatus.name
            it[processedData] = submittedProcessedDataWithAllKeysForInsertions.data
            it[errors] = submittedErrors
            it[warnings] = submittedWarnings
            it[finishedProcessingAt] = now
        }
    }

    private fun addMissingKeysForInsertions(
        submittedProcessedData: SubmittedProcessedData,
    ): SubmittedProcessedData {
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

    private fun throwInsertFailedException(submittedProcessedData: SubmittedProcessedData): String {
        val selectedSequenceEntries = SequenceEntriesTable
            .slice(
                SequenceEntriesTable.accession,
                SequenceEntriesTable.version,
                SequenceEntriesTable.status,
            )
            .select(
                where = {
                    (SequenceEntriesTable.accession eq submittedProcessedData.accession) and
                        (SequenceEntriesTable.version eq submittedProcessedData.version)
                },
            )

        val accessionVersion = submittedProcessedData.displayAccessionVersion()
        if (selectedSequenceEntries.count() == 0L) {
            throw UnprocessableEntityException("Accession version $accessionVersion does not exist")
        }

        val selectedSequence = selectedSequenceEntries.first()
        if (selectedSequence[SequenceEntriesTable.status] != IN_PROCESSING.name) {
            throw UnprocessableEntityException(
                "Accession version $accessionVersion is in not in state $IN_PROCESSING " +
                    "(was ${selectedSequence[SequenceEntriesTable.status]})",
            )
        }
        throw RuntimeException("Update processed data: Unexpected error for accession versions $accessionVersion")
    }

    fun approveProcessedData(submitter: String, accessionVersions: List<AccessionVersion>) {
        log.info { "approving ${accessionVersions.size} sequences by $submitter" }

        queryPreconditionValidator.validateAccessionVersions(submitter, accessionVersions, listOf(AWAITING_APPROVAL))

        SequenceEntriesTable.update(
            where = {
                accessionVersionIsIn(accessionVersions) and (SequenceEntriesTable.status eq AWAITING_APPROVAL.name)
            },
        ) {
            it[status] = APPROVED_FOR_RELEASE.name
        }
    }

    fun getLatestVersions(): Map<Accession, Version> {
        val maxVersionExpression = SequenceEntriesTable.version.max()
        return SequenceEntriesTable
            .slice(SequenceEntriesTable.accession, maxVersionExpression)
            .select(
                where = {
                    (SequenceEntriesTable.status eq APPROVED_FOR_RELEASE.name)
                },
            )
            .groupBy(SequenceEntriesTable.accession)
            .associate { it[SequenceEntriesTable.accession] to it[maxVersionExpression]!! }
    }

    fun getLatestRevocationVersions(): Map<Accession, Version> {
        val maxVersionExpression = SequenceEntriesTable.version.max()
        return SequenceEntriesTable
            .slice(SequenceEntriesTable.accession, maxVersionExpression)
            .select(
                where = {
                    (SequenceEntriesTable.status eq APPROVED_FOR_RELEASE.name) and
                        (SequenceEntriesTable.isRevocation eq true)
                },
            )
            .groupBy(SequenceEntriesTable.accession)
            .associate { it[SequenceEntriesTable.accession] to it[maxVersionExpression]!! }
    }

    fun streamReleasedSubmissions(): Sequence<RawProcessedData> {
        return SequenceEntriesTable
            .slice(
                SequenceEntriesTable.accession,
                SequenceEntriesTable.version,
                SequenceEntriesTable.isRevocation,
                SequenceEntriesTable.processedData,
                SequenceEntriesTable.submitter,
                SequenceEntriesTable.submittedAt,
                SequenceEntriesTable.submissionId,
            )
            .select(
                where = {
                    (SequenceEntriesTable.status eq APPROVED_FOR_RELEASE.name)
                },
            )
            // TODO(#429): This needs clarification of how to handle revocations. Until then, revocations are filtered out.
            .filter { !it[SequenceEntriesTable.isRevocation] }
            .map {
                RawProcessedData(
                    accession = it[SequenceEntriesTable.accession],
                    version = it[SequenceEntriesTable.version],
                    isRevocation = it[SequenceEntriesTable.isRevocation],
                    submitter = it[SequenceEntriesTable.submitter],
                    submissionId = it[SequenceEntriesTable.submissionId],
                    processedData = it[SequenceEntriesTable.processedData]!!,
                    submittedAt = it[SequenceEntriesTable.submittedAt],
                )
            }
            .asSequence()
    }

    fun streamReviewNeededSubmissions(submitter: String, numberOfSequences: Int, outputStream: OutputStream) {
        log.info { "streaming $numberOfSequences submissions that need review by $submitter" }
        val maxVersionQuery = maxVersionQuery()

        val sequencesData = SequenceEntriesTable
            .slice(
                SequenceEntriesTable.accession,
                SequenceEntriesTable.version,
                SequenceEntriesTable.status,
                SequenceEntriesTable.processedData,
                SequenceEntriesTable.originalData,
                SequenceEntriesTable.errors,
                SequenceEntriesTable.warnings,
            )
            .select(
                where = {
                    (SequenceEntriesTable.status eq HAS_ERRORS.name) and
                        (SequenceEntriesTable.version eq maxVersionQuery) and
                        (SequenceEntriesTable.submitter eq submitter)
                },
            ).limit(numberOfSequences).map { row ->
                SequenceEntryReview(
                    row[SequenceEntriesTable.accession],
                    row[SequenceEntriesTable.version],
                    Status.fromString(row[SequenceEntriesTable.status]),
                    row[SequenceEntriesTable.processedData]!!,
                    row[SequenceEntriesTable.originalData]!!,
                    row[SequenceEntriesTable.errors],
                    row[SequenceEntriesTable.warnings],
                )
            }

        iteratorStreamer.streamAsNdjson(sequencesData, outputStream)
    }

    fun getActiveSequencesSubmittedBy(username: String): List<SequenceEntryStatus> {
        log.info { "getting active sequence entries submitted by $username" }

        val subTableSequenceStatus = SequenceEntriesTable
            .slice(
                SequenceEntriesTable.accession,
                SequenceEntriesTable.version,
                SequenceEntriesTable.status,
                SequenceEntriesTable.isRevocation,
            )

        val releasedSequenceEntries = subTableSequenceStatus
            .select(
                where = {
                    (SequenceEntriesTable.status eq APPROVED_FOR_RELEASE.name) and
                        (SequenceEntriesTable.submitter eq username) and
                        (SequenceEntriesTable.version eq maxReleasedVersionQuery())
                },
            ).map { row ->
                SequenceEntryStatus(
                    row[SequenceEntriesTable.accession],
                    row[SequenceEntriesTable.version],
                    APPROVED_FOR_RELEASE,
                    row[SequenceEntriesTable.isRevocation],
                )
            }

        val maxVersionQuery = maxVersionQuery()
        val unreleasedSequenceEntries = subTableSequenceStatus.select(
            where = {
                (SequenceEntriesTable.status neq APPROVED_FOR_RELEASE.name) and
                    (SequenceEntriesTable.submitter eq username) and
                    (SequenceEntriesTable.version eq maxVersionQuery)
            },
        ).map { row ->
            SequenceEntryStatus(
                row[SequenceEntriesTable.accession],
                row[SequenceEntriesTable.version],
                Status.fromString(row[SequenceEntriesTable.status]),
                row[SequenceEntriesTable.isRevocation],
            )
        }

        return releasedSequenceEntries + unreleasedSequenceEntries
    }

    private fun maxReleasedVersionQuery(): Expression<Long?> {
        val subQueryTable = SequenceEntriesTable.alias("subQueryTable")
        return wrapAsExpression(
            subQueryTable
                .slice(subQueryTable[SequenceEntriesTable.version].max())
                .select {
                    (subQueryTable[SequenceEntriesTable.accession] eq SequenceEntriesTable.accession) and
                        (subQueryTable[SequenceEntriesTable.status] eq APPROVED_FOR_RELEASE.name)
                },
        )
    }

    fun reviseData(submitter: String, revisedData: List<RevisedData>): List<SubmissionIdMapping> {
        log.info { "revising sequence entries" }

        val maxVersionQuery = maxVersionQuery()
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val accessionVersions =
            queryPreconditionValidator.validateAccessions(
                submitter,
                revisedData.map { it.accession },
                listOf(APPROVED_FOR_RELEASE),
            ).associateBy { it.accession }

        revisedData.map { data ->
            SequenceEntriesTable.insert(
                SequenceEntriesTable.slice(
                    SequenceEntriesTable.accession,
                    SequenceEntriesTable.version.plus(1),
                    SequenceEntriesTable.submissionId,
                    SequenceEntriesTable.submitter,
                    dateTimeParam(now),
                    stringParam(RECEIVED.name),
                    booleanParam(false),
                    QueryParameter(data.originalData, SequenceEntriesTable.originalData.columnType),
                ).select(
                    where = {
                        (SequenceEntriesTable.accession eq data.accession) and
                            (SequenceEntriesTable.version eq maxVersionQuery) and
                            (SequenceEntriesTable.status eq APPROVED_FOR_RELEASE.name) and
                            (SequenceEntriesTable.submitter eq submitter)
                    },
                ),
                columns = listOf(
                    SequenceEntriesTable.accession,
                    SequenceEntriesTable.version,
                    SequenceEntriesTable.submissionId,
                    SequenceEntriesTable.submitter,
                    SequenceEntriesTable.submittedAt,
                    SequenceEntriesTable.status,
                    SequenceEntriesTable.isRevocation,
                    SequenceEntriesTable.originalData,
                ),
            )
        }

        return revisedData.map {
            SubmissionIdMapping(it.accession, accessionVersions[it.accession]!!.version + 1, it.submissionId)
        }
    }

    fun revoke(accessions: List<Accession>, username: String): List<SequenceEntryStatus> {
        log.info { "revoking ${accessions.size} sequences" }

        queryPreconditionValidator.validateAccessions(username, accessions, listOf(APPROVED_FOR_RELEASE))

        val maxVersionQuery = maxVersionQuery()
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        SequenceEntriesTable.insert(
            SequenceEntriesTable.slice(
                SequenceEntriesTable.accession,
                SequenceEntriesTable.version.plus(1),
                SequenceEntriesTable.submissionId,
                SequenceEntriesTable.submitter,
                dateTimeParam(now),
                stringParam(AWAITING_APPROVAL_FOR_REVOCATION.name),
                booleanParam(true),
            ).select(
                where = {
                    (SequenceEntriesTable.accession inList accessions) and
                        (SequenceEntriesTable.version eq maxVersionQuery) and
                        (SequenceEntriesTable.status eq APPROVED_FOR_RELEASE.name)
                },
            ),
            columns = listOf(
                SequenceEntriesTable.accession,
                SequenceEntriesTable.version,
                SequenceEntriesTable.submissionId,
                SequenceEntriesTable.submitter,
                SequenceEntriesTable.submittedAt,
                SequenceEntriesTable.status,
                SequenceEntriesTable.isRevocation,
            ),
        )

        return SequenceEntriesTable
            .slice(
                SequenceEntriesTable.accession,
                SequenceEntriesTable.version,
                SequenceEntriesTable.status,
                SequenceEntriesTable.isRevocation,
            )
            .select(
                where = {
                    (SequenceEntriesTable.accession inList accessions) and
                        (SequenceEntriesTable.version eq maxVersionQuery) and
                        (SequenceEntriesTable.status eq AWAITING_APPROVAL_FOR_REVOCATION.name)
                },
            ).map {
                SequenceEntryStatus(
                    it[SequenceEntriesTable.accession],
                    it[SequenceEntriesTable.version],
                    AWAITING_APPROVAL_FOR_REVOCATION,
                    it[SequenceEntriesTable.isRevocation],
                )
            }
    }

    fun confirmRevocation(accessionVersions: List<AccessionVersion>, username: String) {
        log.info { "Confirming revocation for ${accessionVersions.size} sequence entries" }

        queryPreconditionValidator.validateAccessionVersions(
            username,
            accessionVersions,
            listOf(AWAITING_APPROVAL_FOR_REVOCATION),
        )

        SequenceEntriesTable.update(
            where = {
                accessionVersionIsIn(accessionVersions) and
                    (SequenceEntriesTable.status eq AWAITING_APPROVAL_FOR_REVOCATION.name)
            },
        ) {
            it[status] = APPROVED_FOR_RELEASE.name
        }
    }

    fun deleteSequences(accessionVersions: List<AccessionVersion>, submitter: String) {
        log.info { "Deleting accession versions: $accessionVersions" }

        queryPreconditionValidator.validateAccessionVersions(
            submitter,
            accessionVersions,
            listOf(RECEIVED, AWAITING_APPROVAL, HAS_ERRORS, AWAITING_APPROVAL_FOR_REVOCATION),
        )

        SequenceEntriesTable.deleteWhere {
            accessionVersionIsIn(accessionVersions)
        }
    }

    fun submitReviewedSequence(submitter: String, reviewedAccessionVersion: UnprocessedData) {
        log.info { "reviewed sequence entry submitted $reviewedAccessionVersion" }

        val sequencesReviewed = SequenceEntriesTable.update(
            where = {
                (SequenceEntriesTable.accession eq reviewedAccessionVersion.accession) and
                    (SequenceEntriesTable.version eq reviewedAccessionVersion.version) and
                    (SequenceEntriesTable.submitter eq submitter) and
                    (
                        (SequenceEntriesTable.status eq AWAITING_APPROVAL.name) or
                            (SequenceEntriesTable.status eq HAS_ERRORS.name)
                        )
            },
        ) {
            it[status] = RECEIVED.name
            it[originalData] = reviewedAccessionVersion.data
            it[errors] = null
            it[warnings] = null
            it[startedProcessingAt] = null
            it[finishedProcessingAt] = null
            it[processedData] = null
        }

        if (sequencesReviewed != 1) {
            handleReviewedSubmissionError(reviewedAccessionVersion, submitter)
        }
    }

    private fun handleReviewedSubmissionError(reviewedAccessionVersion: UnprocessedData, submitter: String) {
        val selectedSequences = SequenceEntriesTable
            .slice(
                SequenceEntriesTable.accession,
                SequenceEntriesTable.version,
                SequenceEntriesTable.status,
                SequenceEntriesTable.submitter,
            )
            .select(
                where = {
                    (SequenceEntriesTable.accession eq reviewedAccessionVersion.accession) and
                        (SequenceEntriesTable.version eq reviewedAccessionVersion.version)
                },
            )

        val accessionVersionString = reviewedAccessionVersion.displayAccessionVersion()

        if (selectedSequences.count().toInt() == 0) {
            throw UnprocessableEntityException("Sequence entry $accessionVersionString does not exist")
        }

        val hasCorrectStatus = selectedSequences.all {
            (it[SequenceEntriesTable.status] == AWAITING_APPROVAL.name) ||
                (it[SequenceEntriesTable.status] == HAS_ERRORS.name)
        }
        if (!hasCorrectStatus) {
            val status = selectedSequences.first()[SequenceEntriesTable.status]
            throw UnprocessableEntityException(
                "Sequence entry $accessionVersionString is in status $status, not in $AWAITING_APPROVAL or $HAS_ERRORS",
            )
        }

        if (selectedSequences.any { it[SequenceEntriesTable.submitter] != submitter }) {
            throw ForbiddenException(
                "Sequence entry $accessionVersionString is not owned by user $submitter",
            )
        }
        throw Exception("SequenceReview: Unknown error")
    }

    fun getReviewData(submitter: String, accessionVersion: AccessionVersion): SequenceEntryReview {
        log.info {
            "Getting sequence entry ${accessionVersion.displayAccessionVersion()} that needs review by $submitter"
        }

        val selectedSequenceEntries = SequenceEntriesTable
            .slice(
                SequenceEntriesTable.accession,
                SequenceEntriesTable.version,
                SequenceEntriesTable.processedData,
                SequenceEntriesTable.originalData,
                SequenceEntriesTable.errors,
                SequenceEntriesTable.warnings,
                SequenceEntriesTable.status,
            )
            .select(
                where = {
                    (
                        (SequenceEntriesTable.status eq HAS_ERRORS.name)
                            or (SequenceEntriesTable.status eq AWAITING_APPROVAL.name)
                        ) and
                        (SequenceEntriesTable.accession eq accessionVersion.accession) and
                        (SequenceEntriesTable.version eq accessionVersion.version) and
                        (SequenceEntriesTable.submitter eq submitter)
                },
            )

        if (selectedSequenceEntries.count().toInt() != 1) {
            handleGetReviewDataError(submitter, accessionVersion)
        }

        return selectedSequenceEntries.first().let {
            SequenceEntryReview(
                it[SequenceEntriesTable.accession],
                it[SequenceEntriesTable.version],
                Status.fromString(it[SequenceEntriesTable.status]),
                it[SequenceEntriesTable.processedData]!!,
                it[SequenceEntriesTable.originalData]!!,
                it[SequenceEntriesTable.errors],
                it[SequenceEntriesTable.warnings],
            )
        }
    }

    private fun handleGetReviewDataError(submitter: String, accessionVersion: AccessionVersion): Nothing {
        val selectedSequences = SequenceEntriesTable
            .slice(
                SequenceEntriesTable.accession,
                SequenceEntriesTable.version,
                SequenceEntriesTable.status,
            )
            .select(
                where = {
                    (SequenceEntriesTable.accession eq accessionVersion.accession) and
                        (SequenceEntriesTable.version eq accessionVersion.version)
                },
            )

        if (selectedSequences.count().toInt() == 0) {
            throw NotFoundException("Accession version ${accessionVersion.displayAccessionVersion()} does not exist")
        }

        val selectedSequence = selectedSequences.first()

        val hasCorrectStatus =
            (selectedSequence[SequenceEntriesTable.status] == AWAITING_APPROVAL.name) ||
                (selectedSequence[SequenceEntriesTable.status] == HAS_ERRORS.name)

        if (!hasCorrectStatus) {
            throw UnprocessableEntityException(
                "Accession version ${accessionVersion.displayAccessionVersion()} is in not in state " +
                    "${HAS_ERRORS.name} or ${AWAITING_APPROVAL.name} " +
                    "(was ${selectedSequence[SequenceEntriesTable.status]})",
            )
        }

        if (!hasPermissionToChange(submitter, accessionVersion)) {
            throw ForbiddenException(
                "Sequence entry ${accessionVersion.displayAccessionVersion()} is not owned by user $submitter",
            )
        }

        throw RuntimeException(
            "Get review data: Unexpected error for accession version ${accessionVersion.displayAccessionVersion()}",
        )
    }

    private fun hasPermissionToChange(user: String, accessionVersion: AccessionVersion): Boolean {
        val sequencesOwnedByUser = SequenceEntriesTable
            .slice(SequenceEntriesTable.accession, SequenceEntriesTable.version, SequenceEntriesTable.submitter)
            .select(
                where = {
                    (SequenceEntriesTable.accession eq accessionVersion.accession) and
                        (SequenceEntriesTable.version eq accessionVersion.version) and
                        (SequenceEntriesTable.submitter eq user)
                },
            )

        return sequencesOwnedByUser.count() == 1L
    }

    private fun accessionVersionIsIn(accessionVersions: List<AccessionVersionInterface>) =
        Pair(SequenceEntriesTable.accession, SequenceEntriesTable.version) inList accessionVersions.toPairs()
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
