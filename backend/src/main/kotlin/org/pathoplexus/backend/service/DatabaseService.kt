package org.pathoplexus.backend.service

import com.mchange.v2.c3p0.ComboPooledDataSource
import org.pathoplexus.backend.config.DatabaseProperties
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

    fun testConnection(): Int {
        getConnection().use { conn ->
            conn.createStatement().use { statement ->
                statement.executeQuery("select 20230731;").use { rs ->
                    rs.next()
                    return rs.getInt(1)
                }
            }
        }
    }
}
