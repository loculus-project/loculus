package org.loculus.backend.service.files

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.config.S3BucketConfig
import org.loculus.backend.config.S3Config
import org.loculus.backend.controller.ServiceUnavailableException

class UnreachableS3ServiceTest {
    private val s3Service = S3Service(
        S3Config(
            enabled = true,
            bucket = S3BucketConfig(
                endpoint = "http://127.0.0.1:1",
                internalEndpoint = null,
                region = "us-east-1",
                bucket = "bucket",
                accessKey = "accessKey",
                secretKey = "secretKey",
            ),
        ),
    )

    @Test
    fun `WHEN listing stored file IDs fails to connect THEN throws service unavailable`() {
        assertThrows<ServiceUnavailableException> {
            s3Service.listStoredFileIds(prefix = "FILE_", startAfter = "FILE_000001").firstOrNull()
        }
    }
}
