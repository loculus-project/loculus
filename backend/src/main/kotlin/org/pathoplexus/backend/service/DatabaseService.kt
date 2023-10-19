package org.pathoplexus.backend.service

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonValue
import com.fasterxml.jackson.core.JacksonException
import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.databind.DeserializationContext
import com.fasterxml.jackson.databind.JsonDeserializer
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.annotation.JsonDeserialize
import com.fasterxml.jackson.module.kotlin.readValue
import io.swagger.v3.oas.annotations.media.Schema
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.Expression
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
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.stringParam
import org.jetbrains.exposed.sql.update
import org.jetbrains.exposed.sql.wrapAsExpression
import org.pathoplexus.backend.config.ReferenceGenome
import org.pathoplexus.backend.controller.BadRequestException
import org.pathoplexus.backend.controller.ForbiddenException
import org.pathoplexus.backend.controller.NotFoundException
import org.pathoplexus.backend.controller.UnprocessableEntityException
import org.pathoplexus.backend.model.HeaderId
import org.pathoplexus.backend.service.Status.NEEDS_REVIEW
import org.pathoplexus.backend.service.Status.PROCESSED
import org.pathoplexus.backend.service.Status.PROCESSING
import org.pathoplexus.backend.service.Status.RECEIVED
import org.pathoplexus.backend.service.Status.REVIEWED
import org.pathoplexus.backend.service.Status.REVOKED_STAGING
import org.pathoplexus.backend.service.Status.SILO_READY
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
) {
    init {
        Database.connect(pool)
    }

    fun insertSubmissions(submitter: String, submittedData: List<SubmittedData>): List<HeaderId> {
        log.info { "submitting ${submittedData.size} new sequences by $submitter" }

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        return submittedData.map { data ->
            val insert = SequencesTable.insert {
                it[SequencesTable.submitter] = submitter
                it[submittedAt] = now
                it[version] = 1
                it[status] = RECEIVED.name
                it[customId] = data.customId
                it[originalData] = data.originalData
            }
            HeaderId(insert[SequencesTable.sequenceId], 1, data.customId)
        }
    }

    fun streamUnprocessedSubmissions(numberOfSequences: Int, outputStream: OutputStream) {
        val maxVersionQuery = maxVersionQuery()

        val sequencesData = SequencesTable
            .slice(SequencesTable.sequenceId, SequencesTable.version, SequencesTable.originalData)
            .select(
                where = {
                    (SequencesTable.status eq RECEIVED.name)
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

        stream(sequencesData, outputStream)
    }

    private fun maxVersionQuery(): Expression<Long?> {
        val subQueryTable = SequencesTable.alias("subQueryTable")
        return wrapAsExpression(
            subQueryTable
                .slice(subQueryTable[SequencesTable.version].max())
                .select { subQueryTable[SequencesTable.sequenceId] eq SequencesTable.sequenceId },
        )
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

    private fun <T> stream(
        sequencesData: List<T>,
        outputStream: OutputStream,
    ) {
        sequencesData
            .forEach { sequence ->
                val json = objectMapper.writeValueAsString(sequence)
                outputStream.write(json.toByteArray())
                outputStream.write('\n'.code)
                outputStream.flush()
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
            submittedErrors.isEmpty() -> Status.PROCESSED
            else -> Status.NEEDS_REVIEW
        }

        return SequencesTable.update(
            where = {
                (SequencesTable.sequenceId eq submittedProcessedDataWithAllKeysForInsertions.sequenceId) and
                    (SequencesTable.version eq submittedProcessedDataWithAllKeysForInsertions.version) and
                    (SequencesTable.status eq Status.PROCESSING.name)
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

        queryPreconditionValidator.validate(submitter, sequenceVersions, listOf(PROCESSED))

        SequencesTable.update(
            where = {
                (Pair(SequencesTable.sequenceId, SequencesTable.version) inList sequenceVersions.toPairs()) and
                    (SequencesTable.status eq PROCESSED.name)
            },
        ) {
            it[status] = SILO_READY.name
        }
    }

    fun streamProcessedSubmissions(numberOfSequences: Int, outputStream: OutputStream) {
        log.info { "streaming $numberOfSequences processed submissions" }
        val maxVersionQuery = maxVersionQuery()

        val sequencesData = SequencesTable
            .slice(
                SequencesTable.sequenceId,
                SequencesTable.version,
                SequencesTable.processedData,
                SequencesTable.errors,
                SequencesTable.warnings,
            )
            .select(
                where = {
                    (SequencesTable.status eq PROCESSED.name) and
                        (SequencesTable.version eq maxVersionQuery)
                },
            ).limit(numberOfSequences).map { row ->
                SubmittedProcessedData(
                    row[SequencesTable.sequenceId],
                    row[SequencesTable.version],
                    row[SequencesTable.processedData]!!,
                    row[SequencesTable.errors],
                    row[SequencesTable.warnings],
                )
            }

        stream(sequencesData, outputStream)
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

        stream(sequencesData, outputStream)
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

    fun reviseData(submitter: String, dataSequence: Sequence<FileData>): List<HeaderId> {
        log.info { "revising sequences" }

        val maxVersionQuery = maxVersionQuery()
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        return dataSequence.map {
            SequencesTable.insert(
                SequencesTable.slice(
                    SequencesTable.sequenceId,
                    SequencesTable.version.plus(1),
                    SequencesTable.customId,
                    SequencesTable.submitter,
                    dateTimeParam(now),
                    stringParam(RECEIVED.name),
                    booleanParam(false),
                    QueryParameter(it.originalData, SequencesTable.originalData.columnType),
                ).select(
                    where = {
                        (SequencesTable.sequenceId eq it.sequenceId) and
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

            HeaderId(it.sequenceId, it.sequenceId, it.customId)
        }.toList()
    }

    fun revoke(sequenceIds: List<Long>, username: String): List<SequenceVersionStatus> {
        log.info { "revoking ${sequenceIds.size} sequences" }

        queryPreconditionValidator.validateRevokePreconditions(username, sequenceIds)

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

    fun confirmRevocation(sequenceVersions: List<SequenceVersion>, username: String): Int {
        log.info { "Confirming revocation for ${sequenceVersions.size} sequences" }

        queryPreconditionValidator.validate(username, sequenceVersions, listOf(REVOKED_STAGING))

        return SequencesTable.update(
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

        queryPreconditionValidator.validate(
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

interface SequenceVersionInterface {
    val sequenceId: Long
    val version: Long

    fun displaySequenceVersion() = "$sequenceId.$version"
}

data class SequenceVersion(
    override val sequenceId: Long,
    override val version: Long,
) : SequenceVersionInterface

fun List<SequenceVersion>.toPairs() = map { Pair(it.sequenceId, it.version) }

data class SubmittedProcessedData(
    override val sequenceId: Long,
    override val version: Long,
    val data: ProcessedData,
    @Schema(description = "The processing failed due to these errors.")
    val errors: List<PreprocessingAnnotation>? = null,
    @Schema(
        description =
        "Issues where data is not necessarily wrong, but the submitter might want to look into those warnings.",
    )
    val warnings: List<PreprocessingAnnotation>? = null,
) : SequenceVersionInterface

data class SequenceReview(
    val sequenceId: Long,
    val version: Long,
    val status: Status,
    val processedData: ProcessedData,
    val originalData: OriginalData,
    @Schema(description = "The preprocessing will be considered failed if this is not empty")
    val errors: List<PreprocessingAnnotation>? = null,
    @Schema(
        description =
        "Issues where data is not necessarily wrong, but the user might want to look into those warnings.",
    )
    val warnings: List<PreprocessingAnnotation>? = null,
)

typealias SegmentName = String
typealias GeneName = String
typealias NucleotideSequence = String
typealias AminoAcidSequence = String

data class ProcessedData(
    @Schema(
        example = """{"date": "2020-01-01", "country": "Germany", "age": 42, "qc": 0.95}""",
        description = "Key value pairs of metadata, correctly typed",
    )
    val metadata: Map<String, JsonNode>,
    @Schema(
        example = """{"segment1": "ACTG", "segment2": "GTCA"}""",
        description = "The key is the segment name, the value is the nucleotide sequence",
    )
    val unalignedNucleotideSequences: Map<SegmentName, NucleotideSequence>,
    @Schema(
        example = """{"segment1": "ACTG", "segment2": "GTCA"}""",
        description = "The key is the segment name, the value is the aligned nucleotide sequence",
    )
    val alignedNucleotideSequences: Map<SegmentName, NucleotideSequence>,
    @Schema(
        example = """{"segment1": ["123:GTCA", "345:AAAA"], "segment2": ["123:GTCA", "345:AAAA"]}""",
        description = "The key is the segment name, the value is a list of nucleotide insertions",
    )
    val nucleotideInsertions: Map<SegmentName, List<Insertion>>,
    @Schema(
        example = """{"gene1": "NRNR", "gene2": "NRNR"}""",
        description = "The key is the gene name, the value is the amino acid sequence",
    )
    val aminoAcidSequences: Map<GeneName, AminoAcidSequence>,
    @Schema(
        example = """{"gene1": ["123:RRN", "345:NNN"], "gene2": ["123:NNR", "345:RN"]}""",
        description = "The key is the gene name, the value is a list of amino acid insertions",
    )
    val aminoAcidInsertions: Map<GeneName, List<Insertion>>,
)

@JsonDeserialize(using = InsertionDeserializer::class)
data class Insertion(
    @Schema(example = "123", description = "Position in the sequence where the insertion starts")
    val position: Int,
    @Schema(example = "GTCA", description = "Inserted sequence")
    val sequence: String,
) {
    companion object {
        fun fromString(insertionString: String): Insertion {
            val parts = insertionString.split(":")
            if (parts.size != 2) {
                throw IllegalArgumentException("Invalid insertion string: $insertionString")
            }
            return Insertion(parts[0].toInt(), parts[1])
        }
    }

    @JsonValue
    override fun toString(): String {
        return "$position:$sequence"
    }
}

class InsertionDeserializer : JsonDeserializer<Insertion>() {
    override fun deserialize(p: JsonParser, ctxt: DeserializationContext): Insertion {
        return Insertion.fromString(p.valueAsString)
    }
}

data class PreprocessingAnnotation(
    val source: List<PreprocessingAnnotationSource>,
    @Schema(description = "A descriptive message that helps the submitter to fix the issue") val message: String,
)

data class PreprocessingAnnotationSource(
    val type: PreprocessingAnnotationSourceType,
    @Schema(description = "Field or sequence segment name") val name: String,
)

enum class PreprocessingAnnotationSourceType {
    Metadata,
    NucleotideSequence,
}

data class SequenceVersionStatus(
    val sequenceId: Long,
    val version: Long,
    val status: Status,
    val isRevocation: Boolean = false,
)

data class FileData(
    val customId: String,
    val sequenceId: Long,
    val originalData: OriginalData,
)

data class SubmittedData(
    val customId: String,
    val originalData: OriginalData,
)

data class UnprocessedData(
    @Schema(example = "123") override val sequenceId: Long,
    @Schema(example = "1") override val version: Long,
    val data: OriginalData,
) : SequenceVersionInterface

data class OriginalData(
    @Schema(
        example = "{\"date\": \"2020-01-01\", \"country\": \"Germany\"}",
        description = "Key value pairs of metadata, as submitted in the metadata file",
    )
    val metadata: Map<String, String>,
    @Schema(
        example = "{\"segment1\": \"ACTG\", \"segment2\": \"GTCA\"}",
        description = "The key is the segment name, the value is the nucleotide sequence",
    )
    val unalignedNucleotideSequences: Map<String, String>,
)

enum class Status {
    @JsonProperty("RECEIVED")
    RECEIVED,

    @JsonProperty("PROCESSING")
    PROCESSING,

    @JsonProperty("NEEDS_REVIEW")
    NEEDS_REVIEW,

    @JsonProperty("REVIEWED")
    REVIEWED,

    @JsonProperty("PROCESSED")
    PROCESSED,

    @JsonProperty("SILO_READY")
    SILO_READY,

    @JsonProperty("REVOKED_STAGING")
    REVOKED_STAGING,

    ;

    companion object {
        private val stringToEnumMap: Map<String, Status> = entries.associateBy { it.name }

        fun fromString(statusString: String): Status {
            return stringToEnumMap[statusString]
                ?: throw IllegalArgumentException("Unknown status: $statusString")
        }
    }
}
