package org.loculus.backend.service.storage

import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.config.S3Config
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest
import java.net.URL
import java.time.Duration

class S3ServiceTest {

    private lateinit var s3Presigner: S3Presigner
    private lateinit var s3Config: S3Config
    private lateinit var s3Service: S3Service

    @BeforeEach
    fun setUp() {
        s3Presigner = mockk()
        s3Config = S3Config().apply {
            bucket = "test-bucket"
            presignedUrlExpirationSeconds = 3600
        }
        s3Service = S3Service(s3Presigner, s3Config)
    }

    @Test
    fun `should generate presigned URL with correct parameters`() {
        // Given
        val key = "test-key"
        val contentType = "text/plain"
        val expectedUrl = "https://test-bucket.s3.amazonaws.com/test-key"
        
        val presignedRequest = mockk<PresignedPutObjectRequest>()
        every { presignedRequest.url() } returns URL(expectedUrl)
        
        val putObjectRequestSlot = slot<PutObjectRequest>()
        val presignRequestSlot = slot<PutObjectPresignRequest>()
        
        every { 
            s3Presigner.presignPutObject(capture(presignRequestSlot)) 
        } returns presignedRequest
        
        // When
        val (url, expiresIn) = s3Service.generatePresignedUrl(key, contentType)
        
        // Then
        verify { s3Presigner.presignPutObject(any()) }
        
        val capturedPresignRequest = presignRequestSlot.captured
        assertEquals(Duration.ofSeconds(3600), capturedPresignRequest.signatureDuration())
        
        // Verify the result
        assertEquals(expectedUrl, url)
        assertEquals(3600L, expiresIn)
    }
}