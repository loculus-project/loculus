package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.loculus.backend.api.PresignedUrlRequest
import org.loculus.backend.api.PresignedUrlResponse
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.auth.HiddenParam
import org.loculus.backend.service.storage.S3Service
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/storage")
@SecurityRequirement(name = "bearerAuth")
@ConditionalOnProperty(name = ["loculus.s3.enabled"], havingValue = "true")
class S3Controller(private val s3Service: S3Service) {

    @Operation(
        description = "Generate a presigned URL for uploading a file to S3",
        responses = [
            ApiResponse(
                responseCode = "200",
                description = "Successfully generated presigned URL",
                content = [Content(mediaType = "application/json", schema = Schema(implementation = PresignedUrlResponse::class))]
            ),
            ApiResponse(
                responseCode = "400",
                description = "Bad request - Invalid key or content type",
                content = [Content(mediaType = "application/json")]
            ),
            ApiResponse(
                responseCode = "401",
                description = "Unauthorized - Authentication required",
                content = [Content(mediaType = "application/json")]
            )
        ]
    )
    @PostMapping("/presigned-url", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun generatePresignedUrl(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestBody request: PresignedUrlRequest
    ): PresignedUrlResponse {
        // Validate the request
        require(request.key.isNotBlank()) { "Key cannot be empty" }
        require(request.contentType.isNotBlank()) { "Content type cannot be empty" }
        
        // Prefix the key with the username to ensure separation between users
        val userPrefixedKey = "users/${authenticatedUser.username}/${request.key}"
        
        val (url, expiresIn) = s3Service.generatePresignedUrl(userPrefixedKey, request.contentType)
        
        return PresignedUrlResponse(url, expiresIn)
    }
}