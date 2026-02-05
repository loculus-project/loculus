package org.loculus.backend.service.files

import org.loculus.backend.config.S3BucketConfig
import org.loculus.backend.config.S3Config
import org.loculus.backend.controller.BadRequestException
import org.loculus.backend.controller.UnprocessableEntityException
import org.springframework.stereotype.Service
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.http.apache.ApacheHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.S3Configuration
import software.amazon.awssdk.services.s3.model.CompleteMultipartUploadRequest
import software.amazon.awssdk.services.s3.model.CompletedMultipartUpload
import software.amazon.awssdk.services.s3.model.CompletedPart
import software.amazon.awssdk.services.s3.model.CreateMultipartUploadRequest
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.HeadObjectRequest
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.PutObjectTaggingRequest
import software.amazon.awssdk.services.s3.model.S3Exception
import software.amazon.awssdk.services.s3.model.Tag
import software.amazon.awssdk.services.s3.model.Tagging
import software.amazon.awssdk.services.s3.model.UploadPartRequest
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest
import software.amazon.awssdk.services.s3.presigner.model.HeadObjectPresignRequest
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest
import software.amazon.awssdk.services.s3.presigner.model.UploadPartPresignRequest
import java.net.URI
import java.security.cert.X509Certificate
import java.time.Duration
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

private const val PRESIGNED_URL_EXPIRY_SECONDS = 60 * 30

data class MultipartUploadHandler(val uploadId: String, val presignedUrls: List<String>)

@Service
class S3Service(private val s3Config: S3Config) {

    private val s3Client: S3Client by lazy { createClient(getS3BucketConfig()) }
    private val presigner: S3Presigner by lazy { createPresigner(getS3BucketConfig()) }

    fun createUrlToUploadPrivateFile(fileId: FileId): String = s3ErrorMapping {
        val config = getS3BucketConfig()
        val putObjectRequest = PutObjectRequest.builder()
            .bucket(config.bucket)
            .key(getFileIdPath(fileId))
            .build()
        val presignRequest = PutObjectPresignRequest.builder()
            .putObjectRequest(putObjectRequest)
            .signatureDuration(Duration.ofSeconds(PRESIGNED_URL_EXPIRY_SECONDS.toLong()))
            .build()
        presigner.presignPutObject(presignRequest).url().toString()
    }

    fun initiateMultipartUploadAndCreateUrlsToUpload(fileId: FileId, numberParts: Int): MultipartUploadHandler =
        s3ErrorMapping {
            if (numberParts <= 0 || numberParts > 10000) {
                throw BadRequestException("The number of parts must between 1 and 10000.")
            }

            val config = getS3BucketConfig()

            val uploadId = s3Client.createMultipartUpload(
                CreateMultipartUploadRequest.builder()
                    .bucket(config.bucket)
                    .key(getFileIdPath(fileId))
                    .build(),
            ).uploadId()

            val urls = (1..numberParts).map { part ->
                val uploadPartRequest = UploadPartRequest.builder()
                    .bucket(config.bucket)
                    .key(getFileIdPath(fileId))
                    .uploadId(uploadId)
                    .partNumber(part)
                    .build()

                val presignRequest = UploadPartPresignRequest.builder()
                    .uploadPartRequest(uploadPartRequest)
                    .signatureDuration(Duration.ofSeconds(PRESIGNED_URL_EXPIRY_SECONDS.toLong()))
                    .build()

                presigner.presignUploadPart(presignRequest).url().toString()
            }

            MultipartUploadHandler(uploadId, urls)
        }

    fun completeMultipartUpload(fileId: FileId, uploadId: String, etags: List<String>) = s3ErrorMapping {
        val config = getS3BucketConfig()

        val completedParts = etags.mapIndexed { index, etag ->
            CompletedPart.builder()
                .partNumber(index + 1)
                .eTag(etag)
                .build()
        }

        s3Client.completeMultipartUpload(
            CompleteMultipartUploadRequest.builder()
                .bucket(config.bucket)
                .key(getFileIdPath(fileId))
                .uploadId(uploadId)
                .multipartUpload(
                    CompletedMultipartUpload.builder()
                        .parts(completedParts)
                        .build(),
                )
                .build(),
        )
        Unit
    }

    fun createUrlToReadPrivateFile(fileId: FileId, downloadFileName: String? = null): String = s3ErrorMapping {
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
        presigner.presignGetObject(presignRequest).url().toString()
    }

    fun createUrlToHeadPrivateFile(fileId: FileId): String = s3ErrorMapping {
        val config = getS3BucketConfig()
        val headRequest = HeadObjectRequest.builder()
            .bucket(config.bucket)
            .key(getFileIdPath(fileId))
            .build()

        val presignRequest = HeadObjectPresignRequest.builder()
            .headObjectRequest(headRequest)
            .signatureDuration(Duration.ofSeconds(PRESIGNED_URL_EXPIRY_SECONDS.toLong()))
            .build()

        presigner.presignHeadObject(presignRequest).url().toString()
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
    fun setFileToPublic(fileId: FileId) = s3ErrorMapping {
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
        Unit
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
        .credentialsProvider(createCredentialProvider(bucketConfig))
        .serviceConfiguration(createServiceConfiguration())
        .httpClient(createTrustAllHttpClient())
        .build()

    private fun createPresigner(bucketConfig: S3BucketConfig): S3Presigner = S3Presigner.builder()
        .endpointOverride(URI.create(bucketConfig.endpoint))
        .region(Region.of(bucketConfig.region))
        .credentialsProvider(createCredentialProvider(bucketConfig))
        .serviceConfiguration(createServiceConfiguration())
        .build()

    private fun createTrustAllHttpClient(): SdkHttpClient {
        val trustAllCerts = arrayOf<TrustManager>(
            object : X509TrustManager {
                override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
            },
        )

        return ApacheHttpClient.builder()
            .tlsTrustManagersProvider { trustAllCerts }
            .build()
    }

    private fun createCredentialProvider(bucketConfig: S3BucketConfig) = StaticCredentialsProvider.create(
        AwsBasicCredentials.create(bucketConfig.accessKey, bucketConfig.secretKey),
    )

    private fun createServiceConfiguration() = S3Configuration.builder()
        .pathStyleAccessEnabled(true)
        .build()

    private fun getFileIdPath(fileId: FileId): String = "files/$fileId"

    /**
     * Returns the file size in bytes, or `null` if the file doesn't exist.
     */
    fun getFileSize(fileId: FileId): Long? = s3ErrorMapping {
        val config = getS3BucketConfig()
        try {
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

/**
 * This function maps S3Exceptions to our exceptions. It separates client and server errors and maps the error messages
 * from S3 to be more suitable for Loculus users. It also ensures that potentially sensitive information, that may be
 * contained in a S3 error message, are not sent to the client.
 */
fun <T> s3ErrorMapping(block: () -> T): T {
    // List of S3 error codes can be found at https://docs.aws.amazon.com/AmazonS3/latest/API/ErrorResponses.html
    try {
        return block()
    } catch (e: S3Exception) {
        throw when (e.awsErrorDetails().errorCode()) {
            "EntityTooSmall" -> UnprocessableEntityException(
                "EntityTooSmall: Your proposed upload is smaller than the minimum allowed object size. " +
                    "Each part, except the last one, must be at least 5 MB.",
            )

            "InvalidPart" -> UnprocessableEntityException(
                "InvalidPart: One or more of the specified parts could not be found. The part may not have been " +
                    "uploaded, or the specified etag may not match the part's etag.",
            )

            "InvalidPartOrder" -> UnprocessableEntityException(
                "The list of parts was not in ascending order. The parts list must be specified in order " +
                    "by part number.",
            )

            else -> RuntimeException("Unexpected S3 error: ${e.awsErrorDetails().errorCode()}")
        }
    }
}
