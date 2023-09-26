package org.pathoplexus.backend.service

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.LongNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.databind.node.TextNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.Query
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.alias
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.json.jsonb
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
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
import java.sql.Connection
import javax.sql.DataSource

private val log = KotlinLogging.logger { }

private val jacksonObjectMapper = jacksonObjectMapper().findAndRegisterModules()

private inline fun <reified T : Any> Table.jacksonSerializableJsonb(columnName: String) = jsonb<T>(
    columnName,
    { value -> jacksonObjectMapper.writeValueAsString(value) },
    { string -> jacksonObjectMapper.readValue(string) },
)

object SequencesTable : Table("sequences") {
    val sequenceId = long("sequence_id").autoIncrement()
    val version = long("version")
    val customId = varchar("custom_id", 255)
    val submitter = varchar("submitter", 255)
    val submittedAt = datetime("submitted_at")
    val startedProcessingAt = datetime("started_processing_at").nullable()
    val finishedProcessingAt = datetime("finished_processing_at").nullable()
    val status = varchar("status", 255)
    val revoked = bool("revoked").default(false)
    val originalData =
        jacksonSerializableJsonb<JsonNode>("original_data").nullable()
    val processedData = jacksonSerializableJsonb<JsonNode>("processed_data").nullable()
    val errors = jacksonSerializableJsonb<JsonNode>("errors").nullable()
    val warnings = jacksonSerializableJsonb<JsonNode>("warnings").nullable()

    override val primaryKey = PrimaryKey(sequenceId, version)
}

@Service
@Transactional
class DatabaseService(
    private val sequenceValidatorService: SequenceValidatorService,
    private val objectMapper: ObjectMapper,
    private val pool: DataSource,
) {
    init {
        Database.connect(pool)
    }

    private fun getConnection(): Connection {
        return pool.connection
    }

    fun <R> useTransactionalConnection(block: (connection: Connection) -> R): R {
        getConnection().use { conn ->
            try {
                conn.autoCommit = false
                val result: R = block(conn)
                conn.commit()
                return result
            } catch (e: Throwable) {
                conn.rollback()
                throw e
            } finally {
                conn.autoCommit = true
            }
        }
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
        val sequencesData = selectMaxVersionsOfReceivedSequences(numberOfSequences)
            .map {
                SequenceVersion(
                    it[SequencesTable.sequenceId],
                    it[SequencesTable.version],
                    it[SequencesTable.originalData]!!,
                )
            }

        log.info { "streaming ${sequencesData.size} of $numberOfSequences requested unprocessed submissions" }

        updateStatus(sequencesData)

        sequencesData
            .forEach { sequence ->
                val json = objectMapper.writeValueAsString(sequence)
                outputStream.write(json.toByteArray())
                outputStream.write('\n'.code)
                outputStream.flush()
            }
    }

    private fun selectMaxVersionsOfReceivedSequences(numberOfSequences: Int): Query {
        val subQueryTable = SequencesTable.alias("subQueryTable")
        val maxVersionQuery = wrapAsExpression<Long>(
            subQueryTable
                .slice(subQueryTable[SequencesTable.version].max())
                .select { subQueryTable[SequencesTable.sequenceId] eq SequencesTable.sequenceId },
        )

        return SequencesTable
            .slice(SequencesTable.sequenceId, SequencesTable.version, SequencesTable.originalData)
            .select(
                where = {
                    (SequencesTable.status eq Status.RECEIVED.name)
                        .and((SequencesTable.version eq maxVersionQuery))
                },
            )
            .limit(numberOfSequences)
    }

    private fun updateStatus(sequences: List<SequenceVersion>) {
        val sequenceVersions = sequences.map { it.sequenceId to it.version }
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)
        SequencesTable.update(
            where = { Pair(SequencesTable.sequenceId, SequencesTable.version) inList sequenceVersions },
        ) {
            it[status] = Status.PROCESSING.name
            it[startedProcessingAt] = now
        }
    }

    fun updateProcessedData(inputStream: InputStream): List<ValidationResult> {
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
        val newStatus = if (sequenceVersion.errors != null && sequenceVersion.errors.isArray && sequenceVersion.errors.size() > 0) {
            Status.NEEDS_REVIEW.name
        } else {
            Status.PROCESSED.name
        }

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
        val sql = """
        update sequences
        set status = ?
        where sequence_id = any (?) 
        and version = (
            select max(version)
            from sequences s
            where s.sequence_id = sequences.sequence_id
        )
        and submitter = ? 
        and status = ?
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, Status.SILO_READY.name)
                statement.setArray(2, statement.connection.createArrayOf("BIGINT", sequenceIds.toTypedArray()))
                statement.setString(3, submitter)
                statement.setString(4, Status.PROCESSED.name)
                statement.executeUpdate()
            }
        }
    }

    fun streamProcessedSubmissions(numberOfSequences: Int, outputStream: OutputStream) {
        val sql = """
        select sequence_id, processed_data, warnings from sequences
        where sequence_id in (
            select sequence_id from sequences 
            where status = ? limit ?        
        )
        and version = (
                select max(version)
                from sequences s
                where s.sequence_id = sequences.sequence_id
            )
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, Status.PROCESSED.name)
                statement.setInt(2, numberOfSequences)
                val rs = statement.executeQuery()
                rs.use {
                    while (rs.next()) {
                        val processedDataObject = objectMapper.readTree(rs.getString("processed_data")) as ObjectNode

                        val metadataJsonObject = processedDataObject["metadata"] as ObjectNode
                        metadataJsonObject.set<JsonNode>("sequenceId", LongNode(rs.getLong("sequence_id")))
                        metadataJsonObject.set<JsonNode>(
                            "warnings",
                            TextNode(rs.getString("warnings")),
                        )

                        processedDataObject.set<JsonNode>("metadata", metadataJsonObject)

                        outputStream.write(objectMapper.writeValueAsString(processedDataObject).toByteArray())
                        outputStream.write('\n'.code)
                        outputStream.flush()
                    }
                }
            }
        }
    }

    fun streamNeededReviewSubmissions(submitter: String, numberOfSequences: Int, outputStream: OutputStream) {
        val sql = """
        select sequence_id, version, processed_data, errors, warnings from sequences
        where sequence_id in (
            select sequence_id from sequences where status = ? and submitter = ? limit ?
        )
        and version = (
            select max(version)
            from sequences s
            where s.sequence_id = sequences.sequence_id
        )
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, Status.NEEDS_REVIEW.name)
                statement.setString(2, submitter)
                statement.setInt(3, numberOfSequences)
                val rs = statement.executeQuery()
                rs.use {
                    while (rs.next()) {
                        val sequenceVersion = SequenceVersion(
                            rs.getLong("sequence_id"),
                            rs.getLong("version"),
                            objectMapper.readTree(rs.getString("processed_data")),
                            objectMapper.readTree(rs.getString("errors")),
                            objectMapper.readTree(rs.getString("warnings")),
                        )
                        val json = objectMapper.writeValueAsString(sequenceVersion)
                        outputStream.write(json.toByteArray())
                        outputStream.write('\n'.code)
                        outputStream.flush()
                    }
                }
            }
        }
    }

    fun getSequencesSubmittedBy(username: String): List<SequenceVersionStatus> {
        val sequenceVersionStatusList = mutableListOf<SequenceVersionStatus>()
        val sql = """
            select sequence_id, status, version, revoked 
            from sequences 
            where submitter = ?
            and status != ?
            and version = (
                select max(version)
                from sequences s
                where s.sequence_id = sequences.sequence_id
            )
            
            union
            
            select sequence_id, status, max(version) as version, revoked
            from sequences
            where submitter = ?
            and status = ?
            
            group by sequence_id, status, revoked
            
            having max(version) = (
                    select max(version)
                    from sequences s
                    where s.sequence_id = sequences.sequence_id
                    and s.status = ?
                )
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, username)
                statement.setString(2, Status.SILO_READY.name)
                statement.setString(3, username)
                statement.setString(4, Status.SILO_READY.name)
                statement.setString(5, Status.SILO_READY.name)
                statement.executeQuery().use { rs ->
                    while (rs.next()) {
                        val sequenceId = rs.getLong("sequence_id")
                        val version = rs.getInt("version")
                        val status = Status.fromString(rs.getString("status"))
                        val revoked = rs.getBoolean("revoked")
                        sequenceVersionStatusList.add(SequenceVersionStatus(sequenceId, version, status, revoked))
                    }
                }
            }
        }
        return sequenceVersionStatusList
    }

    fun deleteUserSequences(username: String) {
        val sql = """
        delete from sequences
        where submitter = ?
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, username)
                statement.executeUpdate()
            }
        }
    }

    fun deleteSequences(sequenceIds: List<Long>) {
        val sql = """
        delete from sequences
        where sequence_id = any (?)
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setArray(1, statement.connection.createArrayOf("BIGINT", sequenceIds.toTypedArray()))
                statement.executeUpdate()
            }
        }
    }

    fun reviseData(submitter: String, dataSequence: Sequence<FileData>): List<RevisionResult> {
        val checkSql = """
        select sequence_id, version, status
        from sequences 
        where sequence_id = ?
        and version = (
            select max(version)
            from sequences s
            where s.sequence_id = sequences.sequence_id
        )
        and submitter = ?
        """.trimIndent()

        val reviseSql = """
        insert into sequences (sequence_id, version, custom_id, submitter, submitted_at, status, revoked, original_data)
        select ?, ?, custom_id, submitter, now(), ?, false, ?::jsonb
        from sequences
        where sequence_id = ?
        and version = ?
        and status = ?
        """.trimIndent()

        val revisionResults = mutableListOf<RevisionResult>()

        useTransactionalConnection { conn ->
            conn.prepareStatement(reviseSql).use { reviseStatement ->
                conn.prepareStatement(checkSql).use { checkStatement ->
                    dataSequence.forEach { sequence ->

                        checkStatement.setLong(1, sequence.sequenceId)
                        checkStatement.setString(2, submitter)
                        val resultSet = checkStatement.executeQuery()

                        if (!resultSet.next()) {
                            revisionResults.add(
                                RevisionResult(
                                    sequence.sequenceId,
                                    -1,
                                    listOf("SequenceId does not exist for user $submitter"),
                                ),
                            )
                        } else {
                            val sequenceId = resultSet.getLong("sequence_id")
                            val version = resultSet.getInt("version")

                            if (resultSet.getString("status") != Status.SILO_READY.name) {
                                revisionResults.add(
                                    RevisionResult(
                                        sequenceId,
                                        version,
                                        listOf(
                                            "SequenceId does exist, but the latest version is not in SILO_READY state",
                                        ),
                                    ),
                                )
                                return@forEach
                            } else {
                                reviseStatement.setLong(1, sequenceId)
                                reviseStatement.setInt(2, version + 1)
                                reviseStatement.setString(3, Status.RECEIVED.name)
                                reviseStatement.setString(4, sequence.data.toString())
                                reviseStatement.setLong(5, sequenceId)
                                reviseStatement.setInt(6, version)
                                reviseStatement.setString(7, Status.SILO_READY.name)

                                if (reviseStatement.executeUpdate() == 1) {
                                    revisionResults.add(
                                        RevisionResult(
                                            sequenceId,
                                            version,
                                            emptyList(),
                                        ),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
        return revisionResults
    }

    fun revokeData(sequenceIds: List<Long>): List<SequenceVersionStatus> {
        val sql = """
        insert into sequences (sequence_id, version, custom_id, submitter, submitted_at, status, revoked)
        select sequence_id, version + 1, custom_id, submitter, now(), ?, true
        from sequences
        where sequence_id = any (?)
        and version = (
            select max(version)
            from sequences s
            where s.sequence_id = sequences.sequence_id
        )
        and status = ?
        returning sequence_id, version
        """.trimIndent()

        val revokedList = mutableListOf<SequenceVersionStatus>()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, Status.REVOKED_STAGING.name)
                statement.setArray(2, statement.connection.createArrayOf("BIGINT", sequenceIds.toTypedArray()))
                statement.setString(3, Status.SILO_READY.name)
                statement.executeQuery().use { rs ->
                    while (rs.next()) {
                        revokedList.add(
                            SequenceVersionStatus(
                                rs.getLong("sequence_id"),
                                rs.getInt("version"),
                                Status.REVOKED_STAGING,
                            ),
                        )
                    }
                }
            }
        }
        return revokedList
    }

    fun confirmRevocation(sequenceIds: List<Long>): List<SequenceVersionStatus> {
        val sql = """
        update sequences set status = ?
        where status = ? 
        and sequence_id = any (?)   
        and version = (
            select max(version)
            from sequences s
            where s.sequence_id = sequences.sequence_id
        )
        returning sequence_id, version, status
        """.trimIndent()

        val confirmationList = mutableListOf<SequenceVersionStatus>()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, Status.SILO_READY.name)
                statement.setString(2, Status.REVOKED_STAGING.name)
                statement.setArray(3, statement.connection.createArrayOf("BIGINT", sequenceIds.toTypedArray()))
                statement.executeQuery().use { rs ->
                    while (rs.next()) {
                        confirmationList.add(
                            SequenceVersionStatus(
                                rs.getLong("sequence_id"),
                                rs.getInt("version"),
                                Status.fromString(rs.getString("status")),
                            ),
                        )
                    }
                }
            }
        }

        return confirmationList
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
    val version: Int,
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
