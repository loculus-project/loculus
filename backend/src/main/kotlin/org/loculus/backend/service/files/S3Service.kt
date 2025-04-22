package org.loculus.backend.service.files

import io.minio.GetPresignedObjectUrlArgs
import io.minio.MinioClient
import io.minio.SetObjectTagsArgs
import io.minio.http.Method
import org.loculus.backend.config.S3BucketConfig
import org.loculus.backend.config.S3Config
import org.springframework.stereotype.Service
import java.util.concurrent.TimeUnit

private const val PRESIGNED_URL_EXPIRY_SECONDS = 60 * 30

@Service
class S3Service(private val s3Config: S3Config) {
    private var client: MinioClient? = null

    fun createUrlToUploadPrivateFile(fileId: FileId): String {
        val config = getS3BucketConfig()
        return getClient().getPresignedObjectUrl(
            GetPresignedObjectUrlArgs.builder()
                .method(Method.PUT)
                .bucket(config.bucket)
                .`object`(getFileName(fileId))
                .expiry(PRESIGNED_URL_EXPIRY_SECONDS, TimeUnit.SECONDS)
                .build(),
        )
    }

    fun createUrlToReadPrivateFile(fileId: FileId, downloadFileName: String? = null): String {
        val config = getS3BucketConfig()
        var args = GetPresignedObjectUrlArgs.builder()
            .method(Method.GET)
            .bucket(config.bucket)
            .`object`(getFileName(fileId))
            .expiry(PRESIGNED_URL_EXPIRY_SECONDS, TimeUnit.SECONDS)
        if (downloadFileName != null) {
            args =
                args.extraQueryParams(
                    mapOf(
                        "response-content-disposition" to "attachment; filename=\"$downloadFileName\"",
                    ),
                )
        }
        return getClient().getPresignedObjectUrl(args.build())
    }

    fun createPublicUrl(fileId: FileId): String {
        val config = getS3BucketConfig()
        return "${config.endpoint}/${config.bucket}/${getFileName(fileId)}"
    }

    fun setFileToPublic(fileId: FileId) {
        val config = getS3BucketConfig()
        getClient().setObjectTags(
            SetObjectTagsArgs.builder()
                .bucket(config.bucket)
                .`object`(getFileName(fileId))
                .tags(mapOf("public" to "true"))
                .build(),
        )
    }

    private fun assertIsEnabled() {
        if (!s3Config.enabled) {
            throw IllegalStateException("S3 is not enabled")
        }
    }

    private fun getS3BucketConfig(): S3BucketConfig {
        assertIsEnabled()
        if (s3Config.bucket == null) {
            throw RuntimeException("S3 buckets configurations are missing")
        }
        return s3Config.bucket
    }

    private fun getClient(): MinioClient {
        if (client == null) {
            client = createClient(getS3BucketConfig())
        }
        return client!!
    }

    private fun createClient(bucketConfig: S3BucketConfig): MinioClient = MinioClient.builder()
        .endpoint(bucketConfig.endpoint)
        .region(bucketConfig.region)
        .credentials(bucketConfig.accessKey, bucketConfig.secretKey)
        .build()

    private fun getFileName(fileId: FileId): String = "files/$fileId"
}
