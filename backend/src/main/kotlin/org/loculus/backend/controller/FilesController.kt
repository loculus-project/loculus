package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.loculus.backend.api.FileIdAndUrl
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.auth.HiddenParam
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.files.S3Service
import org.loculus.backend.service.groupmanagement.GroupManagementPreconditionValidator
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/files")
@Validated
@SecurityRequirement(name = "bearerAuth")
class FilesController(
    private val filesDatabaseService: FilesDatabaseService,
    private val s3Service: S3Service,
    private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
) {

    @Operation(description = "Requests S3 presigned URLs to upload files")
    @PostMapping("/request-uploads")
    fun requestUploads(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(description = GROUP_ID_DESCRIPTION) @RequestParam groupId: Int,
        @Parameter(description = "Number of URLs, default is 1") @RequestParam numberFiles: Int = 1,
    ): List<FileIdAndUrl> {
        groupManagementPreconditionValidator.validateUserIsAllowedToModifyGroup(
            groupId,
            authenticatedUser,
        )
        val response = mutableListOf<FileIdAndUrl>()
        for (i in 0 until numberFiles) {
            val fileId = filesDatabaseService.createFileEntry(authenticatedUser.username, groupId)
            val presignedUploadUrl = s3Service.createUrlToUploadPrivateFile(fileId, groupId)
            response.add(FileIdAndUrl(fileId, presignedUploadUrl))
        }
        return response
    }
}
