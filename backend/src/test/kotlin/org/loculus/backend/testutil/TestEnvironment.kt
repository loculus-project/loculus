package org.loculus.backend.testutil

import org.loculus.backend.testutil.binary.LocalMinio
import org.loculus.backend.testutil.binary.LocalPostgres
import org.loculus.backend.testutil.docker.DockerMinio
import org.loculus.backend.testutil.docker.DockerPostgres
import java.io.File
import java.net.Socket

class TestEnvironment {
    val useNonDockerInfra: Boolean = System.getenv("USE_NONDOCKER_INFRA") == "true"

    val postgres: PostgresProvider = if (useNonDockerInfra) LocalPostgres() else DockerPostgres()
    val minio: MinioProvider = if (useNonDockerInfra) LocalMinio() else DockerMinio()

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
