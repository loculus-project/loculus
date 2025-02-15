package org.loculus.backend.service.s3files

import io.minio.*
import io.minio.http.Method
import org.loculus.backend.config.BackendConfig
import org.springframework.stereotype.Service
import java.util.*
import java.util.concurrent.TimeUnit


// TODO Move to config
private val MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024
private val PRE_SIGNED_URL_EXPIRY_SECONDS = 60 * 30

// TODO The service should only be created if the S3 storage is enabled
@Service
class S3FilesService(
    backendConfig: BackendConfig,
) {
    val minioClient: MinioClient = MinioClient.builder()
        .endpoint(backendConfig.s3Storage.endpoint!!)
        .credentials(backendConfig.s3Storage.auth!!.accessKey, backendConfig.s3Storage.auth.secretKey)
        .build()
    val privateBucket = backendConfig.s3Storage.buckets!!.private
    val publicBucket = backendConfig.s3Storage.buckets!!.public

    private fun createPreSignedUrl(objectName: String, method: Method): String {
        // TODO Limit file size to MAX_FILE_SIZE_BYTES
        return minioClient.getPresignedObjectUrl(
            GetPresignedObjectUrlArgs.builder()
                .bucket(privateBucket)
                .expiry(PRE_SIGNED_URL_EXPIRY_SECONDS, TimeUnit.SECONDS)
                .method(method)
                .`object`(objectName)
                .build(),
        )
    }

    private fun getFileUploadObjectName(fileId: String): String {
        return "files_uploads/$fileId"
    }

    private fun getFileObjectName(fileId: String): String {
        return "files/$fileId"
    }

    /**
     * Returns the public URL of the file (it does not check whether the file has actually been published)
     */
    fun getPublicURL(fileId: String): String {
        TODO()
    }

    fun initiateUpload(userName: String, ownerGroupId: Int): S3FileHandle {
        // TODO Error handling
        val fileId = UUID.randomUUID().toString()
        // TODO Create row in file_uploads
        return S3FileHandle(fileId, createPreSignedUrl(getFileUploadObjectName(fileId), Method.POST))
    }


    fun confirmUpload(fileId: String): S3FileUploadStatus {
        // TODO Error handling
        // Move files from upload area to the private bucket
        minioClient.copyObject(
            CopyObjectArgs.builder()
                .source(CopySource.builder().bucket(privateBucket).`object`(getFileUploadObjectName(fileId)).build())
                .bucket(privateBucket)
                .`object`(getFileObjectName(fileId))
                .build(),
        )
        minioClient.removeObject(RemoveObjectArgs.builder()
            .bucket(privateBucket).`object`(getFileUploadObjectName(fileId)).build())

        // Check file size
        val fileStats = minioClient.statObject(StatObjectArgs.builder()
            .bucket(privateBucket).`object`(getFileObjectName(fileId)).build())
        val fileSize = fileStats.size()

        // TODO Update database

        return S3FileUploadStatus(fileId, true)
    }

    fun readFile(fileId: String): S3FileHandle {
        return S3FileHandle(fileId, createPreSignedUrl(getFileObjectName(fileId), Method.GET))
    }

    fun publishFile(fileId: String) {
        // TODO Update database
        // TODO Error handling

        // Copy the file to the public bucket
        minioClient.copyObject(
            CopyObjectArgs.builder()
                .source(CopySource.builder().bucket(privateBucket).`object`(getFileObjectName(fileId)).build())
                .bucket(publicBucket)
                .`object`(getFileObjectName(fileId))
                .build(),
        )
    }

}
