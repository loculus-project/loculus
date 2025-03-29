package org.loculus.backend.service.files

import io.minio.GetPresignedObjectUrlArgs
import io.minio.MinioClient
import io.minio.http.Method
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.S3BucketConfig
import org.loculus.backend.config.S3BucketListConfig
import org.springframework.stereotype.Service
import java.util.concurrent.TimeUnit

private const val PRESIGNED_URL_EXPIRY_SECONDS = 60 * 30

@Service
class S3Service(private val backendConfig: BackendConfig) {
    private final val s3Config = backendConfig.s3
    private var publicClient: MinioClient? = null
    private var privateClient: MinioClient? = null

    fun createUrlToUploadPrivateFile(fileId: FileId, groupId: Int): String {
        val config = getBucketListConfig().private
        return getPrivateClient().getPresignedObjectUrl(
            GetPresignedObjectUrlArgs.builder()
                .method(Method.PUT)
                .bucket(config.bucket)
                .`object`(getFileName(fileId, groupId))
                .expiry(PRESIGNED_URL_EXPIRY_SECONDS, TimeUnit.SECONDS)
                .build(),
        )
    }

    private fun assertIsEnabled() {
        if (!s3Config.enabled) {
            throw IllegalStateException("S3 is not enabled")
        }
    }

    private fun getBucketListConfig(): S3BucketListConfig {
        assertIsEnabled()
        if (s3Config.buckets == null) {
            throw RuntimeException("S3 buckets configurations are missing")
        }
        return s3Config.buckets
    }

    private fun getPublicClient(): MinioClient {
        if (publicClient == null) {
            publicClient = createClient(getBucketListConfig().public)
        }
        return publicClient!!
    }

    private fun getPrivateClient(): MinioClient {
        if (privateClient == null) {
            privateClient = createClient(getBucketListConfig().private)
        }
        return privateClient!!
    }

    private fun createClient(bucketConfig: S3BucketConfig): MinioClient = MinioClient.builder()
        .endpoint(bucketConfig.endpoint)
        .region(bucketConfig.region)
        .credentials(bucketConfig.accessKey, bucketConfig.secretKey)
        .build()

    private fun getFileName(fileId: FileId, groupId: Int): String = "files/$groupId/$fileId"
}
