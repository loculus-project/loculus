package org.pathoplexus.backend.service

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
            values (?, now(), null, 'received', ?::jsonb )
            returning sequence_id, original_data->>'header' as header;
        """.trimIndent()
        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                for (originalDataJson in originalDataJsons) {
                    statement.setString(1, submitter)
                    statement.setString(2, originalDataJson)
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
        update sequences set status = 'processing', started_processing_at = now()
        where sequence_id in (
            select sequence_id from sequences where status = 'received' limit ?
        )
        returning sequence_id, original_data
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setInt(1, numberOfSequences)
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
        update sequences set status = 'siloed'
        where sequence_id in (
            select sequence_id from sequences where status = 'processed' limit ?
        )
        returning sequence_id, processed_data
        """.trimIndent()

        useTransactionalConnection { conn ->
            conn.prepareStatement(sql).use { statement ->
                statement.setInt(1, numberOfSequences)
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

    fun updateProcessedData(inputStream: InputStream) {
        val reader = BufferedReader(InputStreamReader(inputStream))

        reader.lineSequence().forEach { line ->

            val sequence = objectMapper.readValue<Sequence>(line)

            val sql = """
            update sequences
            set status = 'processed', finished_processing_at = now(), processed_data = ?
            where sequence_id = ?
            """.trimIndent()

            useTransactionalConnection { conn ->
                conn.prepareStatement(sql).use { statement ->
                    statement.setObject(1, PGobject().apply { type = "jsonb"; value = sequence.data.toString() })
                    statement.setLong(2, sequence.sequenceId)
                    statement.executeUpdate()
                }
            }
        }

        reader.close()
    }
}

data class Sequence(
    val sequenceId: Long,
    val data: JsonNode,
)
