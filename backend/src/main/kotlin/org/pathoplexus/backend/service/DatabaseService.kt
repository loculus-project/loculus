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
import org.jetbrains.exposed.dao.LongEntity
import org.jetbrains.exposed.dao.LongEntityClass
import org.jetbrains.exposed.dao.id.EntityID
import org.jetbrains.exposed.dao.id.LongIdTable
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.alias
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.json.jsonb
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.wrapAsExpression
import org.pathoplexus.backend.model.HeaderId
import org.postgresql.util.PGobject
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.sql.Connection
import java.sql.PreparedStatement
import javax.sql.DataSource

private val jacksonObjectMapper = jacksonObjectMapper().findAndRegisterModules()

private inline fun <reified T : Any> Table.jacksonSerializableJsonb(columnName: String) = jsonb<T>(
    columnName,
    { value -> jacksonObjectMapper.writeValueAsString(value) },
    { string -> jacksonObjectMapper.readValue(string) },
)

object SequencesTable : LongIdTable("sequences", "sequence_id") {
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
}

class SequenceEntity(id: EntityID<Long>) : LongEntity(id) {
    companion object : LongEntityClass<SequenceEntity>(SequencesTable)

    var version by SequencesTable.version
    var customId by SequencesTable.customId
    var submitter by SequencesTable.submitter
    var submittedAt by SequencesTable.submittedAt
    var startedProcessingAt by SequencesTable.startedProcessingAt
    var finishedProcessingAt by SequencesTable.finishedProcessingAt
    var status by SequencesTable.status
    var revoked by SequencesTable.revoked
    var originalData by SequencesTable.originalData
    var processedData by SequencesTable.processedData
    var errors by SequencesTable.errors
    var warnings by SequencesTable.warnings
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
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        return submittedData.map { data ->
            val insert = SequencesTable.insert {
                it[version] = 1
                it[SequencesTable.submitter] = submitter
                it[submittedAt] = now
                it[version] = 1
                it[status] = Status.RECEIVED.name
                it[customId] = data.first
                it[originalData] = objectMapper.readTree(data.second)
            }
            HeaderId(insert[SequencesTable.id].value, 1, data.first)
        }
    }

    fun streamUnprocessedSubmissions(numberOfSequences: Int, outputStream: OutputStream) {
        val subQueryTable = SequencesTable.alias("subQueryTable")

        val maxVersionQuery = wrapAsExpression<Long>(
            subQueryTable
                .slice(subQueryTable[SequencesTable.version].max())
                .select { subQueryTable[SequencesTable.id] eq SequencesTable.id },
        )

        SequenceEntity.find {
            (SequencesTable.status eq Status.RECEIVED.name)
                .and((SequencesTable.version eq maxVersionQuery))
        }
            .limit(numberOfSequences)
            .forEach { sequenceEntity ->
                sequenceEntity.status = Status.PROCESSING.name

                val sequence = Sequence(
                    sequenceEntity.id.value,
                    sequenceEntity.version.toInt(),
                    sequenceEntity.originalData!!,
                )
                val json = objectMapper.writeValueAsString(sequence)
                outputStream.write(json.toByteArray())
                outputStream.write('\n'.code)
                outputStream.flush()
            }
    }

    fun updateProcessedData(inputStream: InputStream): List<ValidationResult> {
        val reader = BufferedReader(InputStreamReader(inputStream))

        val validationResults = mutableListOf<ValidationResult>()

        val checkIdSql = """
        select sequence_id
        from sequences 
        where sequence_id = ?
        """.trimIndent()

        val checkStatusSql = """
        select sequence_id
        from sequences 
        where sequence_id = ?
        and status = ?
        """.trimIndent()

        val updateSql = """
        update sequences
        set status = ?, finished_processing_at = now(), processed_data = ?, errors = ?, warnings = ?
        where sequence_id = ? 
        and version = ?
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(updateSql).use { updateStatement ->
                conn.prepareStatement(checkStatusSql).use { checkIfStatusExistsStatement ->
                    conn.prepareStatement(checkIdSql).use { checkIfIdExistsStatement ->
                        reader.lineSequence().forEach { line ->
                            val sequence = objectMapper.readValue<Sequence>(line)

                            if (!idExists(sequence, checkIfIdExistsStatement, validationResults)) return@forEach

                            if (!statusExists(sequence, checkIfStatusExistsStatement, validationResults)) return@forEach

                            val validationResult = sequenceValidatorService.validateSequence(sequence)
                            if (sequenceValidatorService.isValidResult(validationResult)) {
                                executeUpdateProcessedData(sequence, updateStatement)
                            } else {
                                validationResults.add(validationResult)
                            }
                        }
                        reader.close()
                    }
                }
            }
        }

        return validationResults
    }

    private fun statusExists(
        sequence: Sequence,
        checkIfStatusExistsStatement: PreparedStatement,
        validationResults: MutableList<ValidationResult>,
    ): Boolean {
        checkIfStatusExistsStatement.setLong(1, sequence.sequenceId)
        checkIfStatusExistsStatement.setString(2, Status.PROCESSING.name)
        val statusIsProcessing = checkIfStatusExistsStatement.executeQuery().next()
        if (!statusIsProcessing) {
            validationResults.add(
                ValidationResult(
                    sequence.sequenceId,
                    emptyList(),
                    emptyList(),
                    emptyList(),
                    listOf("SequenceId does exist, but is not in processing state"),
                ),
            )
        }
        return statusIsProcessing
    }

    private fun idExists(
        sequence: Sequence,
        checkIfIdExistsStatement: PreparedStatement,
        validationResults: MutableList<ValidationResult>,
    ): Boolean {
        checkIfIdExistsStatement.setLong(1, sequence.sequenceId)
        val sequenceIdExists = checkIfIdExistsStatement.executeQuery().next()
        if (!sequenceIdExists) {
            validationResults.add(
                ValidationResult(
                    sequence.sequenceId,
                    emptyList(),
                    emptyList(),
                    emptyList(),
                    listOf("SequenceId does not exist"),
                ),
            )
        }
        return sequenceIdExists
    }

    private fun executeUpdateProcessedData(sequence: Sequence, updateStatement: PreparedStatement) {
        val hasErrors = sequence.errors != null &&
            sequence.errors.isArray &&
            sequence.errors.size() > 0

        if (hasErrors) {
            updateStatement.setString(1, Status.NEEDS_REVIEW.name)
        } else {
            updateStatement.setString(1, Status.PROCESSED.name)
        }

        updateStatement.setObject(
            2,
            PGobject().apply {
                type = "jsonb"; value = sequence.data.toString()
            },
        )
        updateStatement.setObject(
            3,
            PGobject().apply {
                type = "jsonb"; value = sequence.errors.toString()
            },
        )
        updateStatement.setObject(
            4,
            PGobject().apply {
                type = "jsonb"; value = sequence.warnings.toString()
            },
        )

        updateStatement.setLong(5, sequence.sequenceId)
        updateStatement.setInt(6, sequence.version)
        updateStatement.executeUpdate()
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
                        val sequence = Sequence(
                            rs.getLong("sequence_id"),
                            rs.getInt("version"),
                            objectMapper.readTree(rs.getString("processed_data")),
                            objectMapper.readTree(rs.getString("errors")),
                            objectMapper.readTree(rs.getString("warnings")),
                        )
                        val json = objectMapper.writeValueAsString(sequence)
                        outputStream.write(json.toByteArray())
                        outputStream.write('\n'.code)
                        outputStream.flush()
                    }
                }
            }
        }
    }

    fun getSequencesSubmittedBy(username: String): List<SequenceStatus> {
        val sequenceStatusList = mutableListOf<SequenceStatus>()
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
                        sequenceStatusList.add(SequenceStatus(sequenceId, version, status, revoked))
                    }
                }
            }
        }
        return sequenceStatusList
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

    fun reviseData(sequenceId: Long) {
        val sql = """
        insert into sequences (sequence_id, version, custom_id, submitter, submitted_at, status, revoked, original_data)
        select ?, version + 1, custom_id, submitter, now(), ?, ?,  original_data
        from sequences
        where sequence_id = ?
        and version = (
            select max(version)
            from sequences s
            where s.sequence_id = sequences.sequence_id
        )
        and status = ?
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setLong(1, sequenceId)
                statement.setString(2, Status.RECEIVED.name)
                statement.setBoolean(3, false)
                statement.setLong(4, sequenceId)
                statement.setString(5, Status.SILO_READY.name)
                statement.executeUpdate()
            }
        }
    }

    fun revokeData(sequenceIds: List<Long>): List<SequenceStatus> {
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

        val revokedList = mutableListOf<SequenceStatus>()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, Status.REVOKED_STAGING.name)
                statement.setArray(2, statement.connection.createArrayOf("BIGINT", sequenceIds.toTypedArray()))
                statement.setString(3, Status.SILO_READY.name)
                statement.executeQuery().use { rs ->
                    while (rs.next()) {
                        revokedList.add(
                            SequenceStatus(rs.getLong("sequence_id"), rs.getInt("version"), Status.REVOKED_STAGING),
                        )
                    }
                }
            }
        }
        return revokedList
    }

    fun confirmRevocation(sequenceIds: List<Long>): List<SequenceStatus> {
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

        val confirmationList = mutableListOf<SequenceStatus>()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, Status.SILO_READY.name)
                statement.setString(2, Status.REVOKED_STAGING.name)
                statement.setArray(3, statement.connection.createArrayOf("BIGINT", sequenceIds.toTypedArray()))
                statement.executeQuery().use { rs ->
                    while (rs.next()) {
                        confirmationList.add(
                            SequenceStatus(
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

data class Sequence(
    val sequenceId: Long,
    val version: Int,
    val data: JsonNode,
    val errors: JsonNode? = null,
    val warnings: JsonNode? = null,
)

data class SequenceStatus(
    val sequenceId: Long,
    val version: Int,
    val status: Status,
    val revoked: Boolean = false,
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
