package org.loculus.backend.testutil.docker

import org.loculus.backend.testutil.MinioProvider
import org.testcontainers.containers.MinIOContainer

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
