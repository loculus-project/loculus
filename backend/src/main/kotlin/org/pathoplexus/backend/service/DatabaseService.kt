package org.pathoplexus.backend.service

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.Expression
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.alias
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.update
import org.jetbrains.exposed.sql.wrapAsExpression
import org.pathoplexus.backend.model.HeaderId
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
    private val sequenceValidatorService: SequenceValidatorService,
    private val objectMapper: ObjectMapper,
    pool: DataSource,
) {
    init {
        Database.connect(pool)
    }

    fun insertSubmissions(submitter: String, submittedData: List<Pair<String, String>>): List<HeaderId> {
        log.info { "submitting ${submittedData.size} new sequences by $submitter" }

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        return submittedData.map { data ->
            val insert = SequencesTable.insert {
                it[SequencesTable.submitter] = submitter
                it[submittedAt] = now
                it[version] = 1
                it[status] = Status.RECEIVED.name
                it[customId] = data.first
                it[originalData] = objectMapper.readTree(data.second)
            }
            HeaderId(insert[SequencesTable.sequenceId], 1, data.first)
        }
    }

    fun streamUnprocessedSubmissions(numberOfSequences: Int, outputStream: OutputStream) {
        val maxVersionQuery = maxVersionQuery()

        val sequencesData = SequencesTable
            .slice(SequencesTable.sequenceId, SequencesTable.version, SequencesTable.originalData)
            .select(
                where = {
                    (SequencesTable.status eq Status.RECEIVED.name)
                        .and((SequencesTable.version eq maxVersionQuery))
                },
            )
            .limit(numberOfSequences)
            .map {
                SequenceVersion(
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

    private fun updateStatusToProcessing(sequences: List<SequenceVersion>) {
        val sequenceVersions = sequences.map { it.sequenceId to it.version }
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)
        SequencesTable.update(
            where = { Pair(SequencesTable.sequenceId, SequencesTable.version) inList sequenceVersions },
        ) {
            it[this.status] = Status.PROCESSING.name
            it[startedProcessingAt] = now
        }
    }

    private fun stream(
        sequencesData: List<Sequence>,
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

    fun updateProcessedData(inputStream: InputStream): List<ValidationResult> {
        log.info { "updating processed data" }
        val reader = BufferedReader(InputStreamReader(inputStream))

        val validationResults = mutableListOf<ValidationResult>()

        reader.lineSequence().forEach { line ->
            val sequence = objectMapper.readValue<SequenceVersion>(line)
            val validationResult = sequenceValidatorService.validateSequence(sequence)

            if (sequenceValidatorService.isValidResult(validationResult)) {
                val numInserted = insertProcessedData(sequence)
                if (numInserted != 1) {
                    validationResults.add(
                        ValidationResult(
                            sequence.sequenceId,
                            emptyList(),
                            emptyList(),
                            emptyList(),
                            listOf(insertProcessedDataError(sequence)),
                        ),
                    )
                }
            } else {
                validationResults.add(validationResult)
            }
        }

        return validationResults
    }

    private fun insertProcessedData(sequenceVersion: SequenceVersion): Int {
        val newStatus = if (sequenceVersion.errors != null &&
            sequenceVersion.errors.isArray &&
            sequenceVersion.errors.size() > 0
        ) {
            Status.NEEDS_REVIEW.name
        } else {
            Status.PROCESSED.name
        }
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        return SequencesTable.update(
            where = {
                (SequencesTable.sequenceId eq sequenceVersion.sequenceId) and
                    (SequencesTable.version eq sequenceVersion.version) and
                    (SequencesTable.status eq Status.PROCESSING.name)
            },
        ) {
            it[status] = newStatus
            it[processedData] = sequenceVersion.data
            it[errors] = sequenceVersion.errors
            it[warnings] = sequenceVersion.warnings
            it[finishedProcessingAt] = now
        }
    }

    private fun insertProcessedDataError(sequenceVersion: SequenceVersion): String {
        val selectedSequences = SequencesTable.select(
            where = {
                (SequencesTable.sequenceId eq sequenceVersion.sequenceId) and
                    (SequencesTable.version eq sequenceVersion.version)
            },
        )
        if (selectedSequences.count().toInt() == 0) {
            return "SequenceId does not exist"
        }
        if (selectedSequences.any { it[SequencesTable.status] != Status.PROCESSING.name }) {
            return "SequenceId is not in processing state"
        }
        return "Unknown error"
    }

    fun approveProcessedData(submitter: String, sequenceIds: List<Long>) {
        log.info { "approving ${sequenceIds.size} sequences by $submitter" }

        if (!hasPermissionToChange(submitter, sequenceIds)) {
            throw IllegalArgumentException("User does not have right to change these sequences")
        }

        val maxVersionQuery = maxVersionQuery()

        SequencesTable.update(
            where = {
                (SequencesTable.sequenceId inList sequenceIds) and
                        (SequencesTable.version eq maxVersionQuery) and
                        (SequencesTable.status eq Status.PROCESSED.name)
            },
        ) {
            it[status] = Status.SILO_READY.name
            it[this.submitter] = submitter
        }
    }

    private fun hasPermissionToChange(user: String, sequenceIds: List<Long>): Boolean {
        val maxVersionQuery = maxVersionQuery()
        val sequencesOwnedByUser = SequencesTable
            .slice(SequencesTable.sequenceId, SequencesTable.version, SequencesTable.submitter)
            .select(
                where = {
                    (SequencesTable.sequenceId inList sequenceIds) and
                            (SequencesTable.version eq maxVersionQuery) and
                            (SequencesTable.submitter eq user)
                },
            ).count()
        return sequencesOwnedByUser == sequenceIds.size.toLong()
    }

    fun streamProcessedSubmissions(numberOfSequences: Int, outputStream: OutputStream) {
        log.info { "streaming $numberOfSequences processed submissions" }
        val maxVersionQuery = maxVersionQuery()

        val sequencesData = SequencesTable.select(
            where = {
                (SequencesTable.status eq Status.PROCESSED.name) and
                        (SequencesTable.version eq maxVersionQuery)
            },
        ).limit(numberOfSequences).map { row ->
            SequenceVersion(
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

        val sequencesData = SequencesTable.select(
            where = {
                (SequencesTable.status eq Status.NEEDS_REVIEW.name) and
                        (SequencesTable.version eq maxVersionQuery) and
                        (SequencesTable.submitter eq submitter)
            },
        ).limit(numberOfSequences).map { row ->
            SequenceVersion(
                row[SequencesTable.sequenceId],
                row[SequencesTable.version],
                row[SequencesTable.processedData]!!,
                row[SequencesTable.errors],
                row[SequencesTable.warnings],
            )
        }

        stream(sequencesData, outputStream)
    }

    fun getActiveSequencesSubmittedBy(username: String): List<SequenceVersionStatus> {
        log.info { "getting active sequences submitted by $username" }

        val maxVersionWithSiloReadyQuery = maxVersionWithSiloReadyQuery()
        val sequencesStatusSiloReady = SequencesTable.select(
            where = {
                (SequencesTable.status eq Status.SILO_READY.name) and
                        (SequencesTable.submitter eq username) and
                        (SequencesTable.version eq maxVersionWithSiloReadyQuery)
            },
        ).map { row ->
            SequenceVersionStatus(
                row[SequencesTable.sequenceId],
                row[SequencesTable.version],
                Status.SILO_READY,
                row[SequencesTable.revoked],
            )
        }

        val maxVersionQuery = maxVersionQuery()
        val sequencesStatusNotSiloReady = SequencesTable.select(
            where = {
                (SequencesTable.status neq Status.SILO_READY.name) and
                        (SequencesTable.submitter eq username) and
                        (SequencesTable.version eq maxVersionQuery)
            },
        ).map { row ->
            SequenceVersionStatus(
                row[SequencesTable.sequenceId],
                row[SequencesTable.version],
                Status.fromString(row[SequencesTable.status]),
                row[SequencesTable.revoked],
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
                            (subQueryTable[SequencesTable.status] eq Status.SILO_READY.name)
                },
        )
    }

    fun deleteUserSequences(username: String) {
        SequencesTable.deleteWhere { submitter eq username }
    }

    fun deleteSequences(sequenceIds: List<Long>) {
        SequencesTable.deleteWhere { sequenceId inList sequenceIds }
    }

    fun reviseData(submitter: String, dataSequence: Sequence<FileData>) {
        log.info { "revising sequences" }

        val maxVersionQuery = maxVersionQuery()
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        dataSequence.forEach {
            SequencesTable.insert(
                SequencesTable.slice(
                    SequencesTable.sequenceId,
                    SequencesTable.version.plus(1),
                    SequencesTable.customId,
                    SequencesTable.submitter,
                    dateTimeParam(now),
                    stringParam(Status.RECEIVED.name),
                    booleanParam(false),
                    QueryParameter(it.data, SequencesTable.originalData.columnType),
                ).select(
                    where = {
                        (SequencesTable.sequenceId eq it.sequenceId) and
                            (SequencesTable.version eq maxVersionQuery) and
                            (SequencesTable.status eq Status.SILO_READY.name) and
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
                    SequencesTable.revoked,
                    SequencesTable.originalData,
                ),
            )
        }
    }

    fun revokeData(sequenceIds: List<Long>): List<SequenceVersionStatus> {
        log.info { "revoking ${sequenceIds.size} sequences" }

        val maxVersionQuery = maxVersionQuery()
        val sequences = SequencesTable.select(
            where = {
                (SequencesTable.sequenceId inList sequenceIds) and
                        (SequencesTable.version eq maxVersionQuery)
            },
        )

        val revokedList = sequences.map { sequence ->
            SequencesTable.insert { insertStatement ->
                insertStatement[sequenceId] = sequence[sequenceId]
                insertStatement[version] = sequence[version] + 1
                insertStatement[customId] = sequence[customId]
                insertStatement[submitter] = sequence[submitter]
                insertStatement[submittedAt] = Clock.System.now().toLocalDateTime(TimeZone.UTC)
                insertStatement[status] = Status.REVOKED_STAGING.name
                insertStatement[revoked] = true
            }

            SequenceVersionStatus(
                sequence[SequencesTable.sequenceId],
                sequence[SequencesTable.version] + 1,
                Status.REVOKED_STAGING,
            )
        }

        return revokedList
    }

    fun confirmRevocation(sequenceIds: List<Long>): Int {
        val maxVersionQuery = maxVersionQuery()

        return SequencesTable.update(
            where = {
                (SequencesTable.sequenceId inList sequenceIds) and
                        (SequencesTable.version eq maxVersionQuery) and
                        (SequencesTable.status eq Status.REVOKED_STAGING.name)
            },
        ) {
            it[status] = Status.SILO_READY.name
        }
    }
}

data class SequenceVersion(
    val sequenceId: Long,
    val version: Long,
    val data: JsonNode,
    val errors: JsonNode? = null,
    val warnings: JsonNode? = null,
)

data class SequenceVersionStatus(
    val sequenceId: Long,
    val version: Long,
    val status: Status,
    val revoked: Boolean = false,
)

data class FileData(
    val customId: String,
    val sequenceId: Long,
    val data: JsonNode,
)

data class RevisionResult(
    val sequenceId: Long,
    val version: Int,
    val genericErrors: List<String> = emptyList(),
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
