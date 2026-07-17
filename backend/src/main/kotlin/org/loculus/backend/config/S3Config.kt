package org.loculus.backend.config

data class S3Config(val enabled: Boolean = false, val bucket: S3BucketConfig?)

data class S3BucketConfig(
    val endpoint: String,
    val internalEndpoint: String?,
    val region: String?,
    val bucket: String,
    // accessKey/secretKey are only set when using static credentials (e.g. MinIO). When both
    // are null, S3Service falls back to the AWS SDK's default credential chain, e.g. IAM role
    // credentials from IRSA on EKS.
    val accessKey: String?,
    val secretKey: String?,
)
