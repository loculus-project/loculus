package org.loculus.backend.api

import io.swagger.v3.oas.annotations.media.Schema

@Schema(description = "Request to generate a presigned URL for uploading a file to S3")
data class PresignedUrlRequest(
    @Schema(description = "The key (path) of the file in S3", example = "uploads/user123/myfile.txt")
    val key: String,
    
    @Schema(description = "The content type of the file", example = "text/plain")
    val contentType: String
)

@Schema(description = "Response containing a presigned URL for uploading a file to S3")
data class PresignedUrlResponse(
    @Schema(description = "The presigned URL that can be used to upload a file to S3", 
           example = "https://bucket.s3.amazonaws.com/path/to/file?X-Amz-Algorithm=...")
    val url: String,
    
    @Schema(description = "The expiration time of the URL in seconds", example = "3600")
    val expiresIn: Long
)