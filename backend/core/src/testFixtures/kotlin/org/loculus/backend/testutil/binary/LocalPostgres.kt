package org.loculus.backend.testutil.binary

import org.loculus.backend.testutil.PostgresProvider
import org.loculus.backend.testutil.waitForPort
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

class LocalPostgres : PostgresProvider {
    private val binDir: Path = Paths.get(
        System.getenv("POSTGRES_BIN_DIR")
            ?: "/workspace/dependencies/postgres/postgresql-17.5.0-x86_64-unknown-linux-gnu/bin",
    )
    private val dataDir: Path = Paths.get(System.getProperty("java.io.tmpdir"), "pgdata")
    private val port: Int = 5432
    private val dbName: String = "test"
    private val user: String = "postgres"

    override val jdbcUrl: String
        get() = "jdbc:postgresql://localhost:$port/$dbName"
    override val username: String
        get() = user
    override val password: String
        get() = ""

    private fun runAsUser(vararg cmd: String, env: Map<String, String> = emptyMap(), allowFailure: Boolean = false) {
        val pb = ProcessBuilder(listOf("runuser", "-u", "nobody", "--") + cmd)
        pb.environment().putAll(env)
        pb.redirectOutput(ProcessBuilder.Redirect.DISCARD)
        pb.redirectError(ProcessBuilder.Redirect.DISCARD)
        val p = pb.start()
        p.waitFor()
        if (!allowFailure && p.exitValue() != 0) {
            throw RuntimeException("Command ${cmd.joinToString(" ")} failed")
        }
    }

    override fun start() {
        Files.createDirectories(dataDir)

        // Clean up any stale server state from previous runs
        runAsUser(binDir.resolve("pg_ctl").toString(), "-D", dataDir.toString(), "-w", "stop", allowFailure = true)
        Files.deleteIfExists(dataDir.resolve("postmaster.pid"))
        ProcessBuilder("chown", "-R", "nobody:nogroup", dataDir.toString())
            .redirectOutput(ProcessBuilder.Redirect.DISCARD)
            .redirectError(ProcessBuilder.Redirect.DISCARD)
            .start().waitFor()
        if (!Files.exists(dataDir.resolve("PG_VERSION"))) {
            runAsUser(binDir.resolve("initdb").toString(), "-A", "trust", "-U", user, "-D", dataDir.toString())
        }
        runAsUser(binDir.resolve("pg_ctl").toString(), "-D", dataDir.toString(), "-o", "-F -p $port", "-w", "start")
        runAsUser(
            binDir.resolve("createdb").toString(),
            "-p",
            port.toString(),
            "-U",
            user,
            dbName,
            env = mapOf("PGUSER" to user),
            allowFailure = true,
        )
        waitForPort(port)
    }

    override fun stop() {
        runAsUser(binDir.resolve("pg_ctl").toString(), "-D", dataDir.toString(), "-w", "stop")
    }

    override fun exec(sql: String) {
        runAsUser(
            binDir.resolve("psql").toString(),
            "-p",
            port.toString(),
            "-U",
            user,
            "-d",
            dbName,
            "-c",
            sql,
            env = mapOf("PGUSER" to user),
        )
    }

    override fun restore(inputFile: File) {
        require(inputFile.exists()) { "Dump file does not exist: ${inputFile.absolutePath}" }

        runAsUser(
            binDir.resolve("psql").toString(),
            "-p",
            port.toString(),
            "-U",
            user,
            "-d",
            dbName,
            "-c",
            inputFile.readText(),
            env = mapOf("PGUSER" to user),
        )
    }
}
