package org.loculus.backend.testutil

import org.testcontainers.containers.MinIOContainer
import org.testcontainers.containers.PostgreSQLContainer
import java.net.Socket
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

object TestEnvironment {
    val useLocalBinaries: Boolean = System.getenv("USE_LOCAL_BINARIES") == "true"

    val postgres: PostgresProvider = if (useLocalBinaries) LocalPostgres() else DockerPostgres()
    val minio: MinioProvider = if (useLocalBinaries) LocalMinio() else DockerMinio()

    fun start() {
        postgres.start()
        minio.start()
    }

    fun stop() {
        postgres.stop()
        minio.stop()
    }
}

interface PostgresProvider {
    val jdbcUrl: String
    val username: String
    val password: String

    fun start()
    fun stop()
    fun exec(sql: String)
}

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

class LocalPostgres : PostgresProvider {
    private val binDir: Path = Paths.get("/tmp/postgres/postgresql-17.5.0-x86_64-unknown-linux-gnu/bin")
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
        pb.inheritIO()
        val p = pb.start()
        p.waitFor()
        if (!allowFailure && p.exitValue() != 0) {
            throw RuntimeException("Command ${cmd.joinToString(" ")} failed")
        }
    }

    override fun start() {
        Files.createDirectories(dataDir)
        ProcessBuilder("chown", "-R", "nobody:nogroup", dataDir.toString()).inheritIO().start().waitFor()
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
}

interface MinioProvider {
    val s3Url: String
    val accessKey: String
    val secretKey: String

    fun start()
    fun stop()
}

class DockerMinio : MinioProvider {
    private val container = MinIOContainer("minio/minio:latest").withReuse(true)

    override val s3Url: String
        get() = container.s3URL
    override val accessKey: String
        get() = container.userName
    override val secretKey: String
        get() = container.password

    override fun start() {
        container.start()
    }

    override fun stop() {
        container.stop()
    }
}

class LocalMinio : MinioProvider {
    private val binary: Path = Paths.get("/tmp/minio")
    private val dataDir: Path = Paths.get(System.getProperty("java.io.tmpdir"), "minio-data")
    private val port: Int = 9000
    private val consolePort: Int = 9001
    private var process: Process? = null

    override val accessKey = "minioadmin"
    override val secretKey = "minioadmin"
    override val s3Url: String
        get() = "http://localhost:$port"

    override fun start() {
        Files.createDirectories(dataDir)
        ProcessBuilder("chown", "-R", "nobody:nogroup", dataDir.toString()).inheritIO().start().waitFor()
        ProcessBuilder("chmod", "+x", binary.toString()).inheritIO().start().waitFor()
        ProcessBuilder("chown", "nobody:nogroup", binary.toString()).inheritIO().start().waitFor()
        val pb = ProcessBuilder(
            "runuser",
            "-u",
            "nobody",
            "--",
            binary.toString(),
            "server",
            "--address",
            ":$port",
            "--console-address",
            ":$consolePort",
            dataDir.toString(),
        )
        pb.environment()["MINIO_ROOT_USER"] = accessKey
        pb.environment()["MINIO_ROOT_PASSWORD"] = secretKey
        pb.inheritIO()
        process = pb.start()
        waitForPort(port)
    }

    override fun stop() {
        process?.destroy()
        process?.waitFor()
    }
}

private fun waitForPort(port: Int, timeoutMillis: Long = 10000) {
    val start = System.currentTimeMillis()
    while (System.currentTimeMillis() - start < timeoutMillis) {
        try {
            Socket("localhost", port).use { return }
        } catch (_: Exception) {
            Thread.sleep(100)
        }
    }
    throw RuntimeException("Port $port not available")
}
