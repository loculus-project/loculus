package org.loculus.backend.service.files

import org.loculus.backend.config.S3BucketConfig
import org.loculus.backend.config.S3Config
import org.springframework.stereotype.Service
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.S3Configuration
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.HeadObjectRequest
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.PutObjectTaggingRequest
import software.amazon.awssdk.services.s3.model.S3Exception
import software.amazon.awssdk.services.s3.model.Tag
import software.amazon.awssdk.services.s3.model.Tagging
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest
import java.net.URI
import java.time.Duration

private const val PRESIGNED_URL_EXPIRY_SECONDS = 60 * 30

@Service
class S3Service(private val s3Config: S3Config) {

    private val s3Client: S3Client by lazy { createClient(getS3BucketConfig()) }
    private val presigner: S3Presigner by lazy { createPresigner(getS3BucketConfig()) }

    fun createUrlToUploadPrivateFile(fileId: FileId): String {
        val config = getS3BucketConfig()
        val putObjectRequest = PutObjectRequest.builder()
            .bucket(config.bucket)
            .key(getFileIdPath(fileId))
            .build()
        val presignRequest = PutObjectPresignRequest.builder()
            .putObjectRequest(putObjectRequest)
            .signatureDuration(Duration.ofSeconds(PRESIGNED_URL_EXPIRY_SECONDS.toLong()))
            .build()
        return presigner.presignPutObject(presignRequest).url().toString()
    }

    fun createUrlToReadPrivateFile(fileId: FileId, downloadFileName: String? = null): String {
        val config = getS3BucketConfig()
        val getReqBuilder = GetObjectRequest.builder()
            .bucket(config.bucket)
            .key(getFileIdPath(fileId))
        if (downloadFileName != null) {
            getReqBuilder.responseContentDisposition("attachment; filename=\"$downloadFileName\"")
        }
        val presignRequest = GetObjectPresignRequest.builder()
            .getObjectRequest(getReqBuilder.build())
            .signatureDuration(Duration.ofSeconds(PRESIGNED_URL_EXPIRY_SECONDS.toLong()))
            .build()
        return presigner.presignGetObject(presignRequest).url().toString()
    }

    /**
     * Returns the URL of the file, which can be used for published files.
     * (Use [createUrlToReadPrivateFile] to generate presigned URLs for not-yet-published files).
     */
    fun getPublicUrl(fileId: FileId): String {
        val config = getS3BucketConfig()
        return "${config.endpoint}/${config.bucket}/${getFileIdPath(fileId)}"
    }

    /**
     * Sets the 'public=true' tag on the given file ID.
     * The bucket should have a policy that files with this tag are publicly accessible.
     */
    fun setFileToPublic(fileId: FileId) {
        val config = getS3BucketConfig()
        s3Client.putObjectTagging(
            PutObjectTaggingRequest.builder()
                .bucket(config.bucket)
                .key(getFileIdPath(fileId))
                .tagging(
                    Tagging.builder()
                        .tagSet(
                            Tag.builder()
                                .key("public")
                                .value("true")
                                .build(),
                        )
                        .build(),
                )
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

    private fun createClient(bucketConfig: S3BucketConfig): S3Client = S3Client.builder()
        .endpointOverride(URI.create(bucketConfig.internalEndpoint ?: bucketConfig.endpoint))
        .region(Region.of(bucketConfig.region))
        .credentialsProvider(
            StaticCredentialsProvider.create(
                AwsBasicCredentials.create(bucketConfig.accessKey, bucketConfig.secretKey),
            ),
        )
        .serviceConfiguration(
            S3Configuration.builder()
                .pathStyleAccessEnabled(true)
                .build(),
        )
        .build()

    private fun createPresigner(bucketConfig: S3BucketConfig): S3Presigner = S3Presigner.builder()
        .endpointOverride(URI.create(bucketConfig.endpoint))
        .region(Region.of(bucketConfig.region))
        .credentialsProvider(
            StaticCredentialsProvider.create(
                AwsBasicCredentials.create(bucketConfig.accessKey, bucketConfig.secretKey),
            ),
        )
        .serviceConfiguration(
            S3Configuration.builder()
                .pathStyleAccessEnabled(true)
                .build(),
        )
        .build()

    private fun getFileIdPath(fileId: FileId): String = "files/$fileId"

    /**
     * Returns the file size in bytes, or `null` if the file doesn't exist.
     */
    fun getFileSize(fileId: FileId): Long? {
        val config = getS3BucketConfig()
        return try {
            s3Client.headObject(
                HeadObjectRequest.builder()
                    .bucket(config.bucket)
                    .key(getFileIdPath(fileId))
                    .build(),
            ).contentLength()
        } catch (e: S3Exception) {
            if (e.statusCode() == 404 || e.awsErrorDetails().errorCode() == "NoSuchKey") null else throw e
        }
    }
}
