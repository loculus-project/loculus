package org.loculus.backend.service.s3files

data class S3FileHandle(
    val fileId: String,
    val preSignedUrl: String,
)
