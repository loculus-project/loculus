package org.loculus.backend.testutil.docker

import org.loculus.backend.testutil.PostgresProvider
import org.testcontainers.containers.PostgreSQLContainer

class DockerPostgres : PostgresProvider {
    private val container = PostgreSQLContainer<Nothing>("postgres:latest")

    override val jdbcUrl: String
        get() = container.jdbcUrl
    override val username: String
        get() = container.username
    override val password: String
        get() = container.password

    override fun start() {
        container.start()
    }

    override fun stop() {
        container.stop()
    }

    override fun exec(sql: String) {
        val result = container.execInContainer(
            "psql",
            "-U",
            container.username,
            "-d",
            container.databaseName,
            "-c",
            sql,
        )
        if (result.exitCode != 0) {
            throw RuntimeException(
                "Database command failed with exit code ${result.exitCode}. Stderr: ${result.stderr}",
            )
        }
    }
}
