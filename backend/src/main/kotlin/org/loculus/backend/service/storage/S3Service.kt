package org.loculus.backend.service.storage

import org.loculus.backend.config.S3Config
import org.springframework.stereotype.Service
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest
import java.time.Duration
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty

@Service
@ConditionalOnProperty(name = ["loculus.s3.enabled"], havingValue = "true")
class S3Service(
    private val s3Presigner: S3Presigner,
    private val s3Config: S3Config
) {
    /**
     * Generate a presigned URL for uploading a file to S3.
     *
     * @param key The key (path) of the file in S3
     * @param contentType The content type of the file
     * @return The presigned URL and its expiration time
     */
    fun generatePresignedUrl(key: String, contentType: String): Pair<String, Long> {
        // Create a PutObjectRequest to upload to the bucket
        val objectRequest = PutObjectRequest.builder()
            .bucket(s3Config.bucket)
            .key(key)
            .contentType(contentType)
            .build()

        // Create a presign request with the configured expiration time
        val presignRequest = PutObjectPresignRequest.builder()
            .signatureDuration(Duration.ofSeconds(s3Config.presignedUrlExpirationSeconds))
            .putObjectRequest(objectRequest)
            .build()

        // Generate the presigned URL
        val presignedRequest = s3Presigner.presignPutObject(presignRequest)
        
        return Pair(presignedRequest.url().toString(), s3Config.presignedUrlExpirationSeconds)
    }
}