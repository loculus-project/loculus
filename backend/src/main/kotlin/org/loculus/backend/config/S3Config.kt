package org.loculus.backend.config

data class S3Config(val enabled: Boolean = false, val bucket: S3BucketConfig?)

data class S3BucketConfig(
    val endpoint: String,
    val internalEndpoint: String?,
    val region: String?,
    val bucket: String,
    val accessKey: String,
    val secretKey: String,
)

data class FileSizeConfig(
    val maxMetadataFileSize: Long,
    val maxSequenceFileSize: Long,
    val maxUncompressedSequenceSize: Long,
)
