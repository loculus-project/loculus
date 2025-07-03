package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.headers.Header
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.apache.http.HttpStatus
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.FileIdAndWriteUrl
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.auth.HiddenParam
import org.loculus.backend.auth.User
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.files.FilesPreconditionValidator
import org.loculus.backend.service.files.S3Service
import org.loculus.backend.service.submission.AccessionPreconditionValidator
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.loculus.backend.utils.Accession
import org.springframework.http.HttpHeaders
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
    private val filesPreconditionValidator: FilesPreconditionValidator,
    private val submissionDatabaseService: SubmissionDatabaseService,
    private val accessionPreconditionValidator: AccessionPreconditionValidator,
) {

    @Operation(
        summary = "Download file via redirect to S3 pre-signed URL",
        description = "Returns a 307 redirect to a pre-signed S3 download URL",
    )
    @ApiResponse(
        responseCode = "307",
        description = "Temporary redirect to S3 download URL",
        headers = [Header(name = HttpHeaders.LOCATION, description = "S3 download URL")],
    )
    @ApiResponse(responseCode = "401", description = "Authentication needed: the file is not public")
    @ApiResponse(responseCode = "403", description = "Not authorized to access this non-public file.")
    @ApiResponse(responseCode = "404", description = "File or accession version does not exist.")
    @GetMapping("/get/{accession}/{version}/{fileCategory}/{fileName}")
    fun getFileDownloadUrl(
        @HiddenParam user: User,
        @PathVariable accession: Accession,
        @PathVariable version: Long,
        @PathVariable fileCategory: String,
        @PathVariable fileName: String,
    ): ResponseEntity<Void> {
        val accessionVersion = AccessionVersion(accession, version)
        val fileId = submissionDatabaseService.getFileId(accessionVersion, fileCategory, fileName)
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
                throw UnauthorizedException("Authentication needed: the file is not public")
            }
        }
        val presignedUrl = s3Service.createUrlToReadPrivateFile(
            fileId,
            fileName,
        )
        return ResponseEntity.status(HttpStatus.SC_TEMPORARY_REDIRECT)
            .location(URI.create(presignedUrl))
            .build()
    }

    @Operation(
        summary = "Request S3 pre-signed URLs for file uploads",
        description =
        "Requests S3 pre-signed URLs to upload files. The endpoint returns a list of file IDs and URLs. " +
            "The URLs should be used to upload the files. Afterwards, the file IDs can be used in the " +
            "`fileMapping` in the /submit endpoint.",
    )
    @ApiResponse(responseCode = "200", description = "Successfully generated pre-signed upload URLs")
    @ApiResponse(responseCode = "400", description = "Invalid request parameters")
    @ApiResponse(responseCode = "401", description = "Authentication required")
    @ApiResponse(responseCode = "403", description = "User is not a member of the specified group")
    @ApiResponse(responseCode = "404", description = "Group does not exist")
    @PostMapping("/request-upload")
    fun requestUploads(
        @HiddenParam
        authenticatedUser: AuthenticatedUser,
        @Parameter(
            description = "The Group ID of the group which will be owning the files. " +
                "The requesting user must be a member of the group.",
        )
        @RequestParam
        groupId: Int,
        @Parameter(description = "Number of URLs, default is 1.")
        @RequestParam
        numberFiles: Int = 1,
    ): List<FileIdAndWriteUrl> {
        filesPreconditionValidator.validateUserIsAllowedToUploadFileForGroup(groupId, authenticatedUser)
        val response = mutableListOf<FileIdAndWriteUrl>()
        if (numberFiles < 1) {
            throw BadRequestException("Number of files must be at least 1")
        }
        repeat(numberFiles) {
            val fileId = filesDatabaseService.createFileEntry(authenticatedUser.username, groupId)
            val presignedUploadUrl = s3Service.createUrlToUploadPrivateFile(fileId)
            response.add(FileIdAndWriteUrl(fileId, presignedUploadUrl))
        }
        return response
    }
}
