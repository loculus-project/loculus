package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.auth.HiddenParam
import org.loculus.backend.service.s3files.S3FileHandle
import org.loculus.backend.service.s3files.S3FileUploadStatus
import org.loculus.backend.service.s3files.S3FilesService
import org.springframework.http.MediaType
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/files")
@Validated
@SecurityRequirement(name = "bearerAuth")
class S3FileController (
    private val s3FilesService: S3FilesService,
) {

    @PostMapping("/request-uploads", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun requestUploads(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(description = GROUP_ID_DESCRIPTION) @RequestParam groupId: Int,
        @RequestParam numberFiles: Int,
    ): List<S3FileHandle> {
        // TODO Perform some checks
        val handles = ArrayList<S3FileHandle>()
        repeat(numberFiles) { s3FilesService.initiateUpload(authenticatedUser.username, groupId) }
        return handles
    }

    @PostMapping("/confirm-uploads", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun confirmUploads(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(description = GROUP_ID_DESCRIPTION) @RequestParam fileIds: List<String>,
    ): List<S3FileUploadStatus> {
        // TODO Perform some checks
        return fileIds.map { s3FilesService.confirmUpload(it) }
    }

}
