package org.loculus.backend.testutil.docker

import org.loculus.backend.testutil.MinioProvider
import org.testcontainers.containers.MinIOContainer

class DockerMinio : MinioProvider {
    init {
        println("DEBUG: DockerMinio init, creating MinIOContainer with image minio/minio:latest")
    }

    private val container = MinIOContainer("minio/minio:latest").withReuse(true)

    override val s3Url: String
        get() = container.s3URL
    override val accessKey: String
        get() = container.userName
    override val secretKey: String
        get() = container.password

    override fun start() {
        println("DEBUG: DockerMinio.start() called")
        val startTime = System.currentTimeMillis()
        container.start()
        val elapsed = System.currentTimeMillis() - startTime
        println("DEBUG: DockerMinio.start() completed in ${elapsed}ms")
        println("DEBUG: MinIO S3 URL: ${container.s3URL}")
    }

    override fun stop() {
        println("DEBUG: DockerMinio.stop() called")
        container.stop()
    }
}
