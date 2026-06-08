package org.loculus.backend.service.files

import org.junit.jupiter.api.Assertions
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertDoesNotThrow
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.config.S3BucketConfig
import org.loculus.backend.config.S3Config
import org.loculus.backend.controller.EndpointTest
import org.springframework.beans.factory.annotation.Autowired
import java.net.URI
import java.util.UUID

@EndpointTest(
    properties = ["${BackendSpringProperty.S3_ENABLED}=true"],
)
class EnabledS3ServiceTest(@Autowired val s3Service: S3Service) {

    @Test
    fun `WHEN calling createUrlToUploadPrivateFile THEN no error is thrown`() {
        assertDoesNotThrow {
            s3Service.createUrlToUploadPrivateFile(UUID.randomUUID())
        }
    }

    @Test
    fun `WHEN upload URL is requested for internal use THEN internal S3 endpoint is used`() {
        val s3Service = S3Service(s3ConfigWithInternalEndpoint())

        val url = s3Service.createUrlToUploadPrivateFile(UUID.randomUUID(), useInternalEndpoint = true)

        Assertions.assertEquals("internal.example", URI.create(url).host)
    }

    @Test
    fun `WHEN upload URL is requested for external use THEN external S3 endpoint is used`() {
        val s3Service = S3Service(s3ConfigWithInternalEndpoint())

        val url = s3Service.createUrlToUploadPrivateFile(UUID.randomUUID())

        Assertions.assertEquals("external.example", URI.create(url).host)
    }

    private fun s3ConfigWithInternalEndpoint() = S3Config(
        enabled = true,
        bucket = S3BucketConfig(
            endpoint = "http://external.example",
            internalEndpoint = "http://internal.example",
            region = "us-east-1",
            bucket = "loculus-preview-private",
            accessKey = "dummyAccessKey",
            secretKey = "dummySecretKey",
        ),
    )
}
