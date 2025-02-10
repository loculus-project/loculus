package org.loculus.backend.service.s3files

data class S3FileUploadStatus(
    val fileId: String,
    val success: Boolean,
    val message: String? = null,
)
