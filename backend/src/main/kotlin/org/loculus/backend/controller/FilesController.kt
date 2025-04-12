package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.apache.http.HttpStatus
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.FileIdAndUrl
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.auth.HiddenParam
import org.loculus.backend.auth.User
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.files.S3Service
import org.loculus.backend.service.groupmanagement.GroupManagementPreconditionValidator
import org.loculus.backend.service.submission.AccessionPreconditionValidator
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.loculus.backend.utils.Accession
import org.springframework.http.ResponseEntity
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.net.URI

@RestController
@RequestMapping("/files")
@Validated
@SecurityRequirement(name = "bearerAuth")
class FilesController(
    private val filesDatabaseService: FilesDatabaseService,
    private val s3Service: S3Service,
    private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
    private val submissionDatabaseService: SubmissionDatabaseService,
    private val accessionPreconditionValidator: AccessionPreconditionValidator,
) {

    @GetMapping("/get/{accession}/{version}/{fileField}/{fileName}")
    fun getFileDownloadUrl(
        @HiddenParam user: User,
        @PathVariable accession: Accession,
        @PathVariable version: Long,
        @PathVariable fileField: String,
        @PathVariable fileName: String,
    ): ResponseEntity<Void> {
        val accessionVersion = AccessionVersion(accession, version)
        val fileId = submissionDatabaseService.getFileId(accessionVersion, fileField, fileName)
        if (fileId == null) {
            throw NotFoundException("File not found")
        }
        val isPublic = filesDatabaseService.isFilePublic(fileId)!!
        if (!isPublic) {
            if (user is AuthenticatedUser) {
                accessionPreconditionValidator.validate {
                    thatAccessionVersionExists(accessionVersion)
                        .andThatUserIsAllowedToEditSequenceEntries(user)
                }
            } else {
                throw ForbiddenException("Authentication needed: the file is not public")
            }
        }
        val presignedUrl = s3Service.createUrlToReadPrivateFile(
            fileId,
            filesDatabaseService.getGroupId(fileId)!!,
            fileName,
        )
        return ResponseEntity.status(HttpStatus.SC_TEMPORARY_REDIRECT)
            .location(URI.create(presignedUrl))
            .build()
    }

    @Operation(description = "Requests S3 presigned URLs to upload files")
    @PostMapping("/request-upload")
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
            val presignedUploadUrl = s3Service.createUrlToUploadPrivateFile(fileId)
            response.add(FileIdAndUrl(fileId, presignedUploadUrl))
        }
        return response
    }
}
