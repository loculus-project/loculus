package org.loculus.backend.testutil.docker

import org.loculus.backend.testutil.MinioProvider
import org.testcontainers.containers.MinIOContainer
import org.testcontainers.utility.DockerImageName

class DockerMinio : MinioProvider {
    private val container = MinIOContainer(
        DockerImageName.parse("quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z")
            .asCompatibleSubstituteFor("minio/minio"),
    ).withReuse(true)

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
