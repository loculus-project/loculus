package org.loculus.backend.service.files

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
    fun `WHEN calling createUrlToUploadPrivateFile with internal endpoint THEN URL uses internal endpoint`() {
        val service = S3Service(
            S3Config(
                true,
                S3BucketConfig(
                    endpoint = "http://external.example",
                    internalEndpoint = "http://internal.example",
                    region = "us-east-1",
                    bucket = "bucket",
                    accessKey = "access",
                    secretKey = "secret",
                ),
            ),
        )

        val externalUrl = service.createUrlToUploadPrivateFile(UUID.randomUUID(), useInternalEndpoint = false)
        val internalUrl = service.createUrlToUploadPrivateFile(UUID.randomUUID(), useInternalEndpoint = true)

        org.junit.jupiter.api.Assertions.assertEquals("external.example", URI.create(externalUrl).host)
        org.junit.jupiter.api.Assertions.assertEquals("internal.example", URI.create(internalUrl).host)
    }
}
