package org.pathoplexus.backend.service

import com.mchange.v2.c3p0.ComboPooledDataSource
import org.pathoplexus.backend.config.DatabaseProperties
import org.pathoplexus.backend.model.HeaderId
import org.springframework.stereotype.Service
import java.sql.Connection

@Service
class DatabaseService(
    private val databaseProperties: DatabaseProperties,
) {
    private val pool: ComboPooledDataSource = ComboPooledDataSource().apply {
        driverClass = "org.postgresql.Driver"
        jdbcUrl = "jdbc:postgresql://${databaseProperties.host}:${databaseProperties.port}/${databaseProperties.name}"
        user = databaseProperties.username
        password = databaseProperties.password
    }

    fun getConnection(): Connection {
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
            insert into sequences (submitter, submitted_at, status, original_data)
            values (?, now(), 'received', ?::jsonb)
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
}
