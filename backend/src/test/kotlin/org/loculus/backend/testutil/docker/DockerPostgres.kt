package org.loculus.backend.testutil.docker

import org.loculus.backend.testutil.PostgresProvider
import org.testcontainers.postgresql.PostgreSQLContainer
import java.io.File

class DockerPostgres : PostgresProvider {
    // THROWAWAY: deliberately unpullable tag, to see what a failed image pull looks like in the CI log.
    private val container = PostgreSQLContainer("postgres:no-such-tag-loculus-ci-fault-injection")

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

    override fun restore(inputFile: File) {
        require(inputFile.exists()) { "Dump file does not exist: ${inputFile.absolutePath}" }

        val result = container.execInContainer(
            "psql",
            "-U",
            container.username,
            "-d",
            container.databaseName,
            "-c",
            inputFile.readText(),
        )

        if (result.exitCode != 0) {
            throw RuntimeException(
                "Database restore failed with exit code ${result.exitCode}. Stderr: ${result.stderr}",
            )
        }
    }
}
