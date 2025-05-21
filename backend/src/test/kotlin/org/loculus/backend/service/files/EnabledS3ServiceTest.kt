package org.loculus.backend.service.files

import org.junit.jupiter.api.Test
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.EndpointTest
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest(
    properties = ["${BackendSpringProperty.S3_ENABLED}=true"],
)
class EnabledS3ServiceTest(@Autowired val s3Service: S3Service) {

    @Test
    fun `WHEN S3 is enabled THEN get an instance of S3ServiceImpl`() {
        assert(s3Service is S3ServiceImpl)
    }
}
