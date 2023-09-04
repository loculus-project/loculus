package org.pathoplexus.backend.service

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.LongNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.databind.node.TextNode
import com.fasterxml.jackson.module.kotlin.readValue
import com.mchange.v2.c3p0.ComboPooledDataSource
import org.pathoplexus.backend.config.DatabaseProperties
import org.pathoplexus.backend.model.HeaderId
import org.postgresql.util.PGobject
import org.springframework.stereotype.Service
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.sql.Connection

@Service
class DatabaseService(
    private val databaseProperties: DatabaseProperties,
    private val sequenceValidatorService: SequenceValidatorService,
    private val objectMapper: ObjectMapper,
) {
    private val pool: ComboPooledDataSource = ComboPooledDataSource().apply {
        driverClass = databaseProperties.driver
        jdbcUrl = databaseProperties.jdbcUrl
        user = databaseProperties.username
        password = databaseProperties.password
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
        val headerIds = mutableListOf<HeaderId>()
        val sql = """
            insert into sequences (submitter, submitted_at, started_processing_at, status, custom_id, original_data)
            values (?, now(), null, ?,?, ?::jsonb )
            returning sequence_id;
        """.trimIndent()
        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, submitter)
                statement.setString(2, Status.RECEIVED.name)
                for (data in submittedData) {
                    statement.setString(3, data.first)
                    statement.setString(4, data.second)
                    statement.executeQuery().use { rs ->
                        rs.next()
                        headerIds.add(HeaderId(rs.getLong("sequence_id"), data.first))
                    }
                }
            }
        }
        return headerIds
    }

    fun streamUnprocessedSubmissions(numberOfSequences: Int, outputStream: OutputStream) {
        val sql = """
        update sequences set status = ?, started_processing_at = now()
        where sequence_id in (
            select sequence_id from sequences where status = ? limit ?
        )
        returning sequence_id, original_data
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, Status.PROCESSING.name)
                statement.setString(2, Status.RECEIVED.name)
                statement.setInt(3, numberOfSequences)
                val rs = statement.executeQuery()
                rs.use {
                    while (rs.next()) {
                        val sequence = Sequence(
                            rs.getLong("sequence_id"),
                            objectMapper.readTree(rs.getString("original_data")),
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

    fun updateProcessedData(inputStream: InputStream): List<ValidationResult> {
        val reader = BufferedReader(InputStreamReader(inputStream))

        val validationResults = mutableListOf<ValidationResult>()

        val checkSql = """
        select sequence_id
        from sequences
        where sequence_id = ?
        """.trimIndent()

        val updateSql = """
        update sequences
        set status = ?, finished_processing_at = now(), processed_data = ?, errors = ?,warnings = ?
        where sequence_id = ?
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(updateSql).use { updateStatement ->
                conn.prepareStatement(checkSql).use { checkIfIdExistsStatement ->
                    reader.lineSequence().forEach { line ->
                        val sequence = objectMapper.readValue<Sequence>(line)

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
                            return@forEach
                        }

                        val validationResult = sequenceValidatorService.validateSequence(sequence)
                        if (sequenceValidatorService.isValidResult(validationResult)) {
                            val hasErrors = sequence.errors != null &&
                                sequence.errors.isArray &&
                                sequence.errors.size() > 0
                            val hasWarnings = sequence.warnings != null &&
                                sequence.warnings.isArray &&
                                sequence.warnings.size() > 0

                            if (hasErrors || hasWarnings) {
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
                            updateStatement.executeUpdate()
                        } else {
                            validationResults.add(validationResult)
                        }
                    }
                    reader.close()
                }
            }
        }

        return validationResults
    }

    fun streamProcessedSubmissions(numberOfSequences: Int, outputStream: OutputStream) {
        val sql = """
        select sequence_id, processed_data, warnings from sequences
        where sequence_id in (
            select sequence_id from sequences where status = ? limit ? 
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
        select sequence_id, processed_data, errors, warnings from sequences
        where sequence_id in (
            select sequence_id from sequences where status = ? and submitter = ? limit ?
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
        select sequence_id, status from sequences where submitter = ?
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, username)
                statement.executeQuery().use { rs ->
                    while (rs.next()) {
                        val sequenceId = rs.getLong("sequence_id")
                        val status = Status.fromString(rs.getString("status"))

                        sequenceStatusList.add(SequenceStatus(sequenceId, status))
                    }
                }
            }
        }
        return sequenceStatusList
    }
}

data class Sequence(
    val sequenceId: Long,
    val data: JsonNode,
    val errors: JsonNode? = null,
    val warnings: JsonNode? = null,
)

data class SequenceStatus(
    val sequenceId: Long,
    val status: Status,
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

    ;

    companion object {
        private val stringToEnumMap: Map<String, Status> = entries.associateBy { it.name }

        fun fromString(statusString: String): Status {
            return stringToEnumMap[statusString]
                ?: throw IllegalArgumentException("Unknown status: $statusString")
        }
    }
}
