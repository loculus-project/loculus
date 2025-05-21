package org.loculus.backend.service.files

import io.minio.GetPresignedObjectUrlArgs
import io.minio.MinioClient
import io.minio.SetObjectTagsArgs
import io.minio.http.Method
import org.loculus.backend.config.S3BucketConfig
import org.loculus.backend.config.S3Config
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import java.util.concurrent.TimeUnit

private const val PRESIGNED_URL_EXPIRY_SECONDS = 60 * 30

@Service
@ConditionalOnProperty(name = ["loculus.s3.enabled"], havingValue = "true", matchIfMissing = false)
class S3ServiceImpl(private val s3Config: S3Config) : S3Service {
    private val client: MinioClient = createClient(getS3BucketConfig())
    private val internalClient: MinioClient = createClient(getS3BucketConfig(), true)

    override fun createUrlToUploadPrivateFile(fileId: FileId): String {
        val config = getS3BucketConfig()
        return getClient().getPresignedObjectUrl(
            GetPresignedObjectUrlArgs.builder()
                .method(Method.PUT)
                .bucket(config.bucket)
                .`object`(getFileIdPath(fileId))
                .expiry(PRESIGNED_URL_EXPIRY_SECONDS, TimeUnit.SECONDS)
                .build(),
        )
    }

    override fun createUrlToReadPrivateFile(fileId: FileId, downloadFileName: String?): String {
        val config = getS3BucketConfig()
        var args = GetPresignedObjectUrlArgs.builder()
            .method(Method.GET)
            .bucket(config.bucket)
            .`object`(getFileIdPath(fileId))
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

    /**
     * Returns the URL of the file, which can be used for published files.
     * (Use [createUrlToReadPrivateFile] to generate presigned URLs for not-yet-published files).
     */
    override fun getPublicUrl(fileId: FileId): String {
        val config = getS3BucketConfig()
        return "${config.endpoint}/${config.bucket}/${getFileIdPath(fileId)}"
    }

    /**
     * Sets the 'public=true' tag on the given file ID.
     * The bucket should have a policy that files with this tag are publicly accessible.
     */
    override fun setFileToPublic(fileId: FileId) {
        val config = getS3BucketConfig()
        getInternalClient().setObjectTags(
            SetObjectTagsArgs.builder()
                .bucket(config.bucket)
                .`object`(getFileIdPath(fileId))
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

    /**
     * Use the client to generate URLs that are accessible from outside the cluster.
     */
    private fun getClient(): MinioClient = client

    /**
     * Use the internal client to make direct requests to S3.
     */
    private fun getInternalClient(): MinioClient = internalClient

    private fun createClient(bucketConfig: S3BucketConfig, internal: Boolean = false): MinioClient =
        MinioClient.builder()
            .endpoint(if (internal) bucketConfig.internalEndpoint ?: bucketConfig.endpoint else bucketConfig.endpoint)
            .region(bucketConfig.region)
            .credentials(bucketConfig.accessKey, bucketConfig.secretKey)
            .build()

    private fun getFileIdPath(fileId: FileId): String = "files/$fileId"
}
