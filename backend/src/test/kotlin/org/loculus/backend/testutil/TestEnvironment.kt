package org.loculus.backend.testutil

import org.loculus.backend.testutil.binary.LocalMinio
import org.loculus.backend.testutil.binary.LocalPostgres
import org.loculus.backend.testutil.docker.DockerMinio
import org.loculus.backend.testutil.docker.DockerPostgres
import java.io.File
import java.net.Socket

class TestEnvironment {
    val useNonDockerInfra: Boolean = System.getenv("USE_NONDOCKER_INFRA") == "true"

    init {
        println("DEBUG: TestEnvironment init, USE_NONDOCKER_INFRA=$useNonDockerInfra")
        println("DEBUG: All USE_NONDOCKER_INFRA env: '${System.getenv("USE_NONDOCKER_INFRA")}'")
    }

    val postgres: PostgresProvider = if (useNonDockerInfra) {
        println("DEBUG: Creating LocalPostgres")
        LocalPostgres()
    } else {
        println("DEBUG: Creating DockerPostgres")
        DockerPostgres()
    }
    val minio: MinioProvider = if (useNonDockerInfra) {
        println("DEBUG: Creating LocalMinio")
        LocalMinio()
    } else {
        println("DEBUG: Creating DockerMinio")
        DockerMinio()
    }

    fun start() {
        println("DEBUG: TestEnvironment.start() called")
        println("DEBUG: Starting postgres...")
        postgres.start()
        println("DEBUG: Postgres started, starting minio...")
        minio.start()
        println("DEBUG: TestEnvironment.start() complete")
    }

    fun stop() {
        println("DEBUG: TestEnvironment.stop() called")
        postgres.stop()
        minio.stop()
        println("DEBUG: TestEnvironment.stop() complete")
    }
}

interface PostgresProvider {
    val jdbcUrl: String
    val username: String
    val password: String

    fun start()
    fun stop()
    fun exec(sql: String)
    fun restore(inputFile: File)
}

interface MinioProvider {
    val s3Url: String
    val accessKey: String
    val secretKey: String

    fun start()
    fun stop()
}

internal fun waitForPort(port: Int, timeoutMillis: Long = 10000) {
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
