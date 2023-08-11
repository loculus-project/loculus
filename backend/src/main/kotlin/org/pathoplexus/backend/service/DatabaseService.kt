package org.pathoplexus.backend.service

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
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
    private val objectMapper: ObjectMapper,
) {
    private val pool: ComboPooledDataSource = ComboPooledDataSource().apply {
        driverClass = "org.postgresql.Driver"
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

    fun insertSubmissions(submitter: String, originalDataJsons: List<String>): List<HeaderId> {
        val headerIds = mutableListOf<HeaderId>()
        val sql = """
            insert into sequences (submitter, submitted_at, started_processing_at, status, original_data)
            values (?, now(), null, ?, ?::jsonb )
            returning sequence_id, original_data->>'header' as header;
        """.trimIndent()
        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, submitter)
                statement.setString(2, Status.RECEIVED.name)
                for (originalDataJson in originalDataJsons) {
                    statement.setString(3, originalDataJson)
                    statement.executeQuery().use { rs ->
                        rs.next()
                        headerIds.add(HeaderId(rs.getString("header"), rs.getLong("sequence_id")))
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

    // TODO(#108): temporary method to ease testing, replace later
    fun streamProcessedSubmissions(numberOfSequences: Int, outputStream: OutputStream) {
        val sql = """
        update sequences set status = ?
        where sequence_id in (
            select sequence_id from sequences where status = ? limit ?
        )
        returning sequence_id, processed_data
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setString(1, Status.COMPLETED.name)
                statement.setString(2, Status.PROCESSED.name)
                statement.setInt(3, numberOfSequences)
                val rs = statement.executeQuery()
                rs.use {
                    while (rs.next()) {
                        val sequence = Sequence(
                            rs.getLong("sequence_id"),
                            objectMapper.readTree(rs.getString("processed_data")),
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

    fun updateProcessedData(inputStream: InputStream) {
        val reader = BufferedReader(InputStreamReader(inputStream))

        val sql = """
            update sequences
            set status = ?, finished_processing_at = now(), processed_data = ?
            where sequence_id = ?
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                reader.lineSequence().forEach { line ->
                    val sequence = objectMapper.readValue<Sequence>(line)
                    statement.setString(1, Status.PROCESSED.name)
                    statement.setObject(2, PGobject().apply { type = "jsonb"; value = sequence.data.toString() })
                    statement.setLong(3, sequence.sequenceId)
                    statement.executeUpdate()
                }
                reader.close()
            }
        }
    }
}

data class Sequence(
    val sequenceId: Long,
    val data: JsonNode,
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

    @JsonProperty("PROCESSED")
    PROCESSED,

    @JsonProperty("COMPLETED")
    COMPLETED,

    ;

    companion object {
        private val stringToEnumMap: Map<String, Status> = entries.associateBy { it.name }

        fun fromString(statusString: String): Status {
            return stringToEnumMap[statusString]
                ?: throw IllegalArgumentException("Unknown status: $statusString")
        }
    }
}
