package org.loculus.backend.service.s3files

import io.minio.GetPresignedObjectUrlArgs
import io.minio.MinioClient
import io.minio.http.Method
import org.springframework.stereotype.Service
import java.util.concurrent.TimeUnit


// TODO Move to config
private val MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024
private val PRE_SIGNED_URL_EXPIRY_SECONDS = 60 * 30
private val ENDPOINT = ""
private val PRIVATE_BUCKET = ""
private val PUBLIC_BUCKET = ""
private val ACCESS_KEY = ""
private val SECRET_KEY = ""



@Service
class S3FilesService {

    val minioClient: MinioClient = MinioClient.builder()
        .endpoint(ENDPOINT)
        .credentials(ACCESS_KEY, SECRET_KEY)
        .build()

    private fun createPreSignedUrl(filePath: String, method: Method): String {
        // TODO Limit file size to MAX_FILE_SIZE_BYTES
        return minioClient.getPresignedObjectUrl(
            GetPresignedObjectUrlArgs.builder()
                .bucket(PRIVATE_BUCKET)
                .expiry(PRE_SIGNED_URL_EXPIRY_SECONDS, TimeUnit.SECONDS)
                .method(method)
                .`object`(filePath)
                .build(),
        )
    }

    /**
     * Returns the public URL of the file (it does not check whether the file has actually been published)
     */
    fun getPublicURL(fileId: String): String {
        TODO()
    }

    fun initiateUpload(userName: String, ownerGroupId: Int): S3FileHandle {
        // Create a UUID
        // Create row in file_uploads
        // Create pre-defined URL
        TODO()
    }


    fun confirmUpload(fileId: String): S3FileUploadStatus {
        // Move files
        // Check file size
        // Create row in files
        // Delete from upload area
        TODO()
    }

    fun readFile(fileId: String): S3FileHandle {
        // Generate pre-signed URL
        TODO()
    }

    fun publishFile(fileId: String) {
        // Copy the file to the public bucket
        TODO()
    }

}
