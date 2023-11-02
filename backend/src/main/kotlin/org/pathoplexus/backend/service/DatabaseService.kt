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
import org.pathoplexus.backend.api.HeaderId
import org.pathoplexus.backend.api.ProcessedData
import org.pathoplexus.backend.api.RevisedData
import org.pathoplexus.backend.api.SequenceReview
import org.pathoplexus.backend.api.SequenceVersion
import org.pathoplexus.backend.api.SequenceVersionInterface
import org.pathoplexus.backend.api.SequenceVersionStatus
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.api.Status.NEEDS_REVIEW
import org.pathoplexus.backend.api.Status.PROCESSED
import org.pathoplexus.backend.api.Status.PROCESSING
import org.pathoplexus.backend.api.Status.RECEIVED
import org.pathoplexus.backend.api.Status.REVIEWED
import org.pathoplexus.backend.api.Status.REVOKED_STAGING
import org.pathoplexus.backend.api.Status.SILO_READY
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

    fun insertSubmissions(submitter: String, submittedData: List<SubmittedData>): List<HeaderId> {
        log.info { "submitting ${submittedData.size} new sequences by $submitter" }

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        return submittedData.map { data ->
            val insert = SequencesTable.insert {
                it[sequenceId] = idSequence.nextLongVal() as NextVal<String>
                it[SequencesTable.submitter] = submitter
                it[submittedAt] = now
                it[version] = 1
                it[status] = RECEIVED.name
                it[customId] = data.customId
                it[originalData] = data.originalData
            }
            HeaderId(insert[SequencesTable.sequenceId], insert[SequencesTable.version], data.customId)
        }
    }

    fun streamUnprocessedSubmissions(numberOfSequences: Int, outputStream: OutputStream) {
        log.info { "streaming unprocessed submissions. Requested $numberOfSequences sequences." }
        val maxVersionQuery = maxVersionQuery()

        val sequencesData = SequencesTable
            .slice(SequencesTable.sequenceId, SequencesTable.version, SequencesTable.originalData)
            .select(
                where = {
                    (SequencesTable.status inList listOf(RECEIVED.name, REVIEWED.name))
                        .and((SequencesTable.version eq maxVersionQuery))
                },
            )
            .limit(numberOfSequences)
            .map {
                UnprocessedData(
                    it[SequencesTable.sequenceId],
                    it[SequencesTable.version],
                    it[SequencesTable.originalData]!!,
                )
            }

        log.info { "streaming ${sequencesData.size} of $numberOfSequences requested unprocessed submissions" }

        updateStatusToProcessing(sequencesData)

        iteratorStreamer.streamAsNdjson(sequencesData, outputStream)
    }

    private fun updateStatusToProcessing(sequences: List<UnprocessedData>) {
        val sequenceVersions = sequences.map { it.sequenceId to it.version }
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)
        SequencesTable
            .update(
                where = { Pair(SequencesTable.sequenceId, SequencesTable.version) inList sequenceVersions },
            ) {
                it[status] = PROCESSING.name
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
            submittedErrors.isEmpty() -> PROCESSED
            else -> NEEDS_REVIEW
        }

        return SequencesTable.update(
            where = {
                (SequencesTable.sequenceId eq submittedProcessedDataWithAllKeysForInsertions.sequenceId) and
                    (SequencesTable.version eq submittedProcessedDataWithAllKeysForInsertions.version) and
                    (SequencesTable.status eq PROCESSING.name)
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
        val selectedSequences = SequencesTable
            .slice(
                SequencesTable.sequenceId,
                SequencesTable.version,
                SequencesTable.status,
            )
            .select(
                where = {
                    (SequencesTable.sequenceId eq submittedProcessedData.sequenceId) and
                        (SequencesTable.version eq submittedProcessedData.version)
                },
            )

        val sequenceVersion = submittedProcessedData.displaySequenceVersion()
        if (selectedSequences.count() == 0L) {
            throw UnprocessableEntityException("Sequence version $sequenceVersion does not exist")
        }

        val selectedSequence = selectedSequences.first()
        if (selectedSequence[SequencesTable.status] != PROCESSING.name) {
            throw UnprocessableEntityException(
                "Sequence version $sequenceVersion is in not in state $PROCESSING " +
                    "(was ${selectedSequence[SequencesTable.status]})",
            )
        }
        throw RuntimeException("Update processed data: Unexpected error for sequence version $sequenceVersion")
    }

    fun approveProcessedData(submitter: String, sequenceVersions: List<SequenceVersion>) {
        log.info { "approving ${sequenceVersions.size} sequences by $submitter" }

        queryPreconditionValidator.validateSequenceVersions(submitter, sequenceVersions, listOf(PROCESSED))

        SequencesTable.update(
            where = {
                (Pair(SequencesTable.sequenceId, SequencesTable.version) inList sequenceVersions.toPairs()) and
                    (SequencesTable.status eq PROCESSED.name)
            },
        ) {
            it[status] = SILO_READY.name
        }
    }

    fun getLatestVersions(): Map<SequenceId, Version> {
        val maxVersionExpression = SequencesTable.version.max()
        return SequencesTable
            .slice(SequencesTable.sequenceId, maxVersionExpression)
            .select(
                where = {
                    (SequencesTable.status eq SILO_READY.name)
                },
            )
            .groupBy(SequencesTable.sequenceId)
            .associate { it[SequencesTable.sequenceId] to it[maxVersionExpression]!! }
    }

    fun getLatestRevocationVersions(): Map<SequenceId, Version> {
        val maxVersionExpression = SequencesTable.version.max()
        return SequencesTable
            .slice(SequencesTable.sequenceId, maxVersionExpression)
            .select(
                where = {
                    (SequencesTable.status eq SILO_READY.name) and
                        (SequencesTable.isRevocation eq true)
                },
            )
            .groupBy(SequencesTable.sequenceId)
            .associate { it[SequencesTable.sequenceId] to it[maxVersionExpression]!! }
    }

    fun streamReleasedSubmissions(): Sequence<RawProcessedData> {
        return SequencesTable
            .slice(
                SequencesTable.sequenceId,
                SequencesTable.version,
                SequencesTable.isRevocation,
                SequencesTable.processedData,
                SequencesTable.submitter,
                SequencesTable.submittedAt,
                SequencesTable.customId,
            )
            .select(
                where = {
                    (SequencesTable.status eq SILO_READY.name)
                },
            )
            // TODO(#429): This needs clarification of how to handle revocations. Until then, revocations are filtered out.
            .filter { !it[SequencesTable.isRevocation] }
            .map {
                RawProcessedData(
                    sequenceId = it[SequencesTable.sequenceId],
                    version = it[SequencesTable.version],
                    isRevocation = it[SequencesTable.isRevocation],
                    submitter = it[SequencesTable.submitter],
                    customId = it[SequencesTable.customId],
                    processedData = it[SequencesTable.processedData]!!,
                    submittedAt = it[SequencesTable.submittedAt],
                )
            }
            .asSequence()
    }

    fun streamReviewNeededSubmissions(submitter: String, numberOfSequences: Int, outputStream: OutputStream) {
        log.info { "streaming $numberOfSequences submissions that need review by $submitter" }
        val maxVersionQuery = maxVersionQuery()

        val sequencesData = SequencesTable
            .slice(
                SequencesTable.sequenceId,
                SequencesTable.version,
                SequencesTable.status,
                SequencesTable.processedData,
                SequencesTable.originalData,
                SequencesTable.errors,
                SequencesTable.warnings,
            )
            .select(
                where = {
                    (SequencesTable.status eq NEEDS_REVIEW.name) and
                        (SequencesTable.version eq maxVersionQuery) and
                        (SequencesTable.submitter eq submitter)
                },
            ).limit(numberOfSequences).map { row ->
                SequenceReview(
                    row[SequencesTable.sequenceId],
                    row[SequencesTable.version],
                    Status.fromString(row[SequencesTable.status]),
                    row[SequencesTable.processedData]!!,
                    row[SequencesTable.originalData]!!,
                    row[SequencesTable.errors],
                    row[SequencesTable.warnings],
                )
            }

        iteratorStreamer.streamAsNdjson(sequencesData, outputStream)
    }

    fun getActiveSequencesSubmittedBy(username: String): List<SequenceVersionStatus> {
        log.info { "getting active sequences submitted by $username" }

        val subTableSequenceStatus = SequencesTable
            .slice(
                SequencesTable.sequenceId,
                SequencesTable.version,
                SequencesTable.status,
                SequencesTable.isRevocation,
            )

        val maxVersionWithSiloReadyQuery = maxVersionWithSiloReadyQuery()
        val sequencesStatusSiloReady = subTableSequenceStatus
            .select(
                where = {
                    (SequencesTable.status eq SILO_READY.name) and
                        (SequencesTable.submitter eq username) and
                        (SequencesTable.version eq maxVersionWithSiloReadyQuery)
                },
            ).map { row ->
                SequenceVersionStatus(
                    row[SequencesTable.sequenceId],
                    row[SequencesTable.version],
                    SILO_READY,
                    row[SequencesTable.isRevocation],
                )
            }

        val maxVersionQuery = maxVersionQuery()
        val sequencesStatusNotSiloReady = subTableSequenceStatus.select(
            where = {
                (SequencesTable.status neq SILO_READY.name) and
                    (SequencesTable.submitter eq username) and
                    (SequencesTable.version eq maxVersionQuery)
            },
        ).map { row ->
            SequenceVersionStatus(
                row[SequencesTable.sequenceId],
                row[SequencesTable.version],
                Status.fromString(row[SequencesTable.status]),
                row[SequencesTable.isRevocation],
            )
        }

        return sequencesStatusSiloReady + sequencesStatusNotSiloReady
    }

    private fun maxVersionWithSiloReadyQuery(): Expression<Long?> {
        val subQueryTable = SequencesTable.alias("subQueryTable")
        return wrapAsExpression(
            subQueryTable
                .slice(subQueryTable[SequencesTable.version].max())
                .select {
                    (subQueryTable[SequencesTable.sequenceId] eq SequencesTable.sequenceId) and
                        (subQueryTable[SequencesTable.status] eq SILO_READY.name)
                },
        )
    }

    fun reviseData(submitter: String, revisedData: List<RevisedData>): List<HeaderId> {
        log.info { "revising sequences" }

        val maxVersionQuery = maxVersionQuery()
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val sequenceVersions =
            queryPreconditionValidator.validateSequenceIds(
                submitter,
                revisedData.map { it.sequenceId },
                listOf(SILO_READY),
            ).associateBy { it.sequenceId }

        revisedData.map { data ->
            SequencesTable.insert(
                SequencesTable.slice(
                    SequencesTable.sequenceId,
                    SequencesTable.version.plus(1),
                    SequencesTable.customId,
                    SequencesTable.submitter,
                    dateTimeParam(now),
                    stringParam(RECEIVED.name),
                    booleanParam(false),
                    QueryParameter(data.originalData, SequencesTable.originalData.columnType),
                ).select(
                    where = {
                        (SequencesTable.sequenceId eq data.sequenceId) and
                            (SequencesTable.version eq maxVersionQuery) and
                            (SequencesTable.status eq SILO_READY.name) and
                            (SequencesTable.submitter eq submitter)
                    },
                ),
                columns = listOf(
                    SequencesTable.sequenceId,
                    SequencesTable.version,
                    SequencesTable.customId,
                    SequencesTable.submitter,
                    SequencesTable.submittedAt,
                    SequencesTable.status,
                    SequencesTable.isRevocation,
                    SequencesTable.originalData,
                ),
            )
        }

        return revisedData.map {
            HeaderId(it.sequenceId, sequenceVersions[it.sequenceId]!!.version + 1, it.customId)
        }
    }

    fun revoke(sequenceIds: List<SequenceId>, username: String): List<SequenceVersionStatus> {
        log.info { "revoking ${sequenceIds.size} sequences" }

        queryPreconditionValidator.validateSequenceIds(username, sequenceIds, listOf(SILO_READY))

        val maxVersionQuery = maxVersionQuery()
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        SequencesTable.insert(
            SequencesTable.slice(
                SequencesTable.sequenceId,
                SequencesTable.version.plus(1),
                SequencesTable.customId,
                SequencesTable.submitter,
                dateTimeParam(now),
                stringParam(REVOKED_STAGING.name),
                booleanParam(true),
            ).select(
                where = {
                    (SequencesTable.sequenceId inList sequenceIds) and
                        (SequencesTable.version eq maxVersionQuery) and
                        (SequencesTable.status eq SILO_READY.name)
                },
            ),
            columns = listOf(
                SequencesTable.sequenceId,
                SequencesTable.version,
                SequencesTable.customId,
                SequencesTable.submitter,
                SequencesTable.submittedAt,
                SequencesTable.status,
                SequencesTable.isRevocation,
            ),
        )

        return SequencesTable
            .slice(
                SequencesTable.sequenceId,
                SequencesTable.version,
                SequencesTable.status,
                SequencesTable.isRevocation,
            )
            .select(
                where = {
                    (SequencesTable.sequenceId inList sequenceIds) and
                        (SequencesTable.version eq maxVersionQuery) and
                        (SequencesTable.status eq REVOKED_STAGING.name)
                },
            ).map {
                SequenceVersionStatus(
                    it[SequencesTable.sequenceId],
                    it[SequencesTable.version],
                    REVOKED_STAGING,
                    it[SequencesTable.isRevocation],
                )
            }
    }

    fun confirmRevocation(sequenceVersions: List<SequenceVersion>, username: String) {
        log.info { "Confirming revocation for ${sequenceVersions.size} sequences" }

        queryPreconditionValidator.validateSequenceVersions(username, sequenceVersions, listOf(REVOKED_STAGING))

        SequencesTable.update(
            where = {
                (Pair(SequencesTable.sequenceId, SequencesTable.version) inList sequenceVersions.toPairs()) and
                    (SequencesTable.status eq REVOKED_STAGING.name)
            },
        ) {
            it[status] = SILO_READY.name
        }
    }

    fun deleteSequences(sequenceVersions: List<SequenceVersion>, submitter: String) {
        log.info { "Deleting sequence versions: $sequenceVersions" }

        queryPreconditionValidator.validateSequenceVersions(
            submitter,
            sequenceVersions,
            listOf(RECEIVED, PROCESSED, NEEDS_REVIEW, REVIEWED, REVOKED_STAGING),
        )

        SequencesTable.deleteWhere {
            (Pair(sequenceId, version) inList sequenceVersions.toPairs())
        }
    }

    fun submitReviewedSequence(submitter: String, reviewedSequenceVersion: UnprocessedData) {
        log.info { "reviewed sequence submitted $reviewedSequenceVersion" }

        val sequencesReviewed = SequencesTable.update(
            where = {
                (SequencesTable.sequenceId eq reviewedSequenceVersion.sequenceId) and
                    (SequencesTable.version eq reviewedSequenceVersion.version) and
                    (SequencesTable.submitter eq submitter) and
                    (
                        (SequencesTable.status eq PROCESSED.name) or
                            (SequencesTable.status eq NEEDS_REVIEW.name)
                        )
            },
        ) {
            it[status] = REVIEWED.name
            it[originalData] = reviewedSequenceVersion.data
            it[errors] = null
            it[warnings] = null
            it[startedProcessingAt] = null
            it[finishedProcessingAt] = null
            it[processedData] = null
        }

        if (sequencesReviewed != 1) {
            handleReviewedSubmissionError(reviewedSequenceVersion, submitter)
        }
    }

    private fun handleReviewedSubmissionError(reviewedSequenceVersion: UnprocessedData, submitter: String) {
        val selectedSequences = SequencesTable
            .slice(
                SequencesTable.sequenceId,
                SequencesTable.version,
                SequencesTable.status,
                SequencesTable.submitter,
            )
            .select(
                where = {
                    (SequencesTable.sequenceId eq reviewedSequenceVersion.sequenceId) and
                        (SequencesTable.version eq reviewedSequenceVersion.version)
                },
            )

        val sequenceVersionString = reviewedSequenceVersion.displaySequenceVersion()

        if (selectedSequences.count().toInt() == 0) {
            throw UnprocessableEntityException("Sequence $sequenceVersionString does not exist")
        }

        val hasCorrectStatus = selectedSequences.all {
            (it[SequencesTable.status] == PROCESSED.name) ||
                (it[SequencesTable.status] == NEEDS_REVIEW.name)
        }
        if (!hasCorrectStatus) {
            throw UnprocessableEntityException(
                "Sequence $sequenceVersionString is in status ${selectedSequences.first()[SequencesTable.status]} " +
                    "not in $PROCESSED or $NEEDS_REVIEW",
            )
        }

        if (selectedSequences.any { it[SequencesTable.submitter] != submitter }) {
            throw ForbiddenException(
                "Sequence $sequenceVersionString is not owned by user $submitter",
            )
        }
        throw Exception("SequenceReview: Unknown error")
    }

    fun getReviewData(submitter: String, sequenceVersion: SequenceVersion): SequenceReview {
        log.info { "Getting Sequence ${sequenceVersion.displaySequenceVersion()} that needs review by $submitter" }

        val selectedSequences = SequencesTable
            .slice(
                SequencesTable.sequenceId,
                SequencesTable.version,
                SequencesTable.processedData,
                SequencesTable.originalData,
                SequencesTable.errors,
                SequencesTable.warnings,
                SequencesTable.status,
            )
            .select(
                where = {
                    (
                        (SequencesTable.status eq NEEDS_REVIEW.name)
                            or (SequencesTable.status eq PROCESSED.name)
                        ) and
                        (SequencesTable.sequenceId eq sequenceVersion.sequenceId) and
                        (SequencesTable.version eq sequenceVersion.version) and
                        (SequencesTable.submitter eq submitter)
                },
            )

        if (selectedSequences.count().toInt() != 1) {
            handleGetReviewDataError(submitter, sequenceVersion)
        }

        return selectedSequences.first().let {
            SequenceReview(
                it[SequencesTable.sequenceId],
                it[SequencesTable.version],
                Status.fromString(it[SequencesTable.status]),
                it[SequencesTable.processedData]!!,
                it[SequencesTable.originalData]!!,
                it[SequencesTable.errors],
                it[SequencesTable.warnings],
            )
        }
    }

    private fun handleGetReviewDataError(submitter: String, sequenceVersion: SequenceVersion): Nothing {
        val selectedSequences = SequencesTable
            .slice(
                SequencesTable.sequenceId,
                SequencesTable.version,
                SequencesTable.status,
            )
            .select(
                where = {
                    (SequencesTable.sequenceId eq sequenceVersion.sequenceId) and
                        (SequencesTable.version eq sequenceVersion.version)
                },
            )

        if (selectedSequences.count().toInt() == 0) {
            throw NotFoundException("Sequence version ${sequenceVersion.displaySequenceVersion()} does not exist")
        }

        val selectedSequence = selectedSequences.first()

        val hasCorrectStatus =
            (selectedSequence[SequencesTable.status] == PROCESSED.name) ||
                (selectedSequence[SequencesTable.status] == NEEDS_REVIEW.name)

        if (!hasCorrectStatus) {
            throw UnprocessableEntityException(
                "Sequence version ${sequenceVersion.displaySequenceVersion()} is in not in state " +
                    "${NEEDS_REVIEW.name} or ${PROCESSED.name} " +
                    "(was ${selectedSequence[SequencesTable.status]})",
            )
        }

        if (!hasPermissionToChange(submitter, sequenceVersion)) {
            throw ForbiddenException(
                "Sequence ${sequenceVersion.displaySequenceVersion()} is not owned by user $submitter",
            )
        }

        throw RuntimeException(
            "Get review data: Unexpected error for sequence version ${sequenceVersion.displaySequenceVersion()}",
        )
    }

    private fun hasPermissionToChange(user: String, sequenceVersion: SequenceVersion): Boolean {
        val sequencesOwnedByUser = SequencesTable
            .slice(SequencesTable.sequenceId, SequencesTable.version, SequencesTable.submitter)
            .select(
                where = {
                    (SequencesTable.sequenceId eq sequenceVersion.sequenceId) and
                        (SequencesTable.version eq sequenceVersion.version) and
                        (SequencesTable.submitter eq user)
                },
            )

        return sequencesOwnedByUser.count() == 1L
    }
}

data class RawProcessedData(
    override val sequenceId: SequenceId,
    override val version: Version,
    val isRevocation: Boolean,
    val submitter: String,
    val submittedAt: LocalDateTime,
    val customId: String,
    val processedData: ProcessedData,
) : SequenceVersionInterface
