package org.loculus.backend.service.files

import org.junit.jupiter.api.Assertions
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.EndpointTest
import org.springframework.beans.factory.annotation.Autowired
import java.util.UUID

@EndpointTest(
    properties = ["${BackendSpringProperty.S3_ENABLED}=false"],
)
class DisabledS3ServiceTest(@Autowired val s3Service: S3Service) {

    @Test
    fun `WHEN S3 is disabled THEN service implementation is still available`() {
        assert(s3Service is S3ServiceImpl)
    }

    @Test
    fun `WHEN calling createUrlToUploadPrivateFile THEN an error is thrown`() {
        assertThrows<IllegalStateException> {
            s3Service.createUrlToUploadPrivateFile(UUID.randomUUID())
        }.also {
            Assertions.assertEquals("S3 is not enabled", it.message)
        }
    }
}
