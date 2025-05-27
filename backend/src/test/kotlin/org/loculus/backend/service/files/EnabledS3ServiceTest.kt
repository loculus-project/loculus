package org.loculus.backend.service.files

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertDoesNotThrow
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.EndpointTest
import org.springframework.beans.factory.annotation.Autowired
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
}
