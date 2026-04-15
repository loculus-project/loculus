package org.loculus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.headers.Header
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import jakarta.validation.Valid
import mu.KotlinLogging
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionsFilterWithApprovalScope
import org.loculus.backend.api.AccessionVersionsFilterWithDeletionScope
import org.loculus.backend.api.AccessionsToRevokeWithComment
import org.loculus.backend.api.CompressionFormat
import org.loculus.backend.api.DataUseTermsType
import org.loculus.backend.api.EditedSequenceEntryData
import org.loculus.backend.api.GetSequenceResponse
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessingResult
import org.loculus.backend.api.SequenceEntryVersionToEdit
import org.loculus.backend.api.Status
import org.loculus.backend.api.SubmissionIdFilesMap
import org.loculus.backend.api.SubmissionIdMapping
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.auth.HiddenParam
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.controller.LoculusCustomHeaders.X_TOTAL_RECORDS
import org.loculus.backend.log.RequestIdContext
import org.loculus.backend.model.ReleasedDataModel
import org.loculus.backend.model.SubmissionParams
import org.loculus.backend.model.SubmitModel
import org.loculus.backend.service.datauseterms.DataUseTermsPreconditionValidator
import org.loculus.backend.service.groupmanagement.GroupManagementPreconditionValidator
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.IteratorStreamer
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import java.util.UUID

private val log = KotlinLogging.logger { }

@RestController
@RequestMapping("/{organism}")
@Validated
@SecurityRequirement(name = "bearerAuth")
open class SubmissionController(
    private val submitModel: SubmitModel,
    private val releasedDataModel: ReleasedDataModel,
    private val submissionDatabaseService: SubmissionDatabaseService,
    private val backendConfig: BackendConfig,
    private val objectMapper: ObjectMapper,
    private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
    private val dataUseTermsPreconditionValidator: DataUseTermsPreconditionValidator,
    iteratorStreamer: IteratorStreamer,
    requestIdContext: RequestIdContext,
) : BaseController(iteratorStreamer, requestIdContext) {
    @Operation(description = SUBMIT_DESCRIPTION)
    @ApiResponse(responseCode = "200", description = SUBMIT_RESPONSE_DESCRIPTION)
    @ApiResponse(responseCode = "400", description = SUBMIT_ERROR_RESPONSE)
    @PostMapping("/submit", consumes = ["multipart/form-data"])
    fun submit(
        @PathVariable @Valid organism: Organism,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(description = GROUP_ID_DESCRIPTION) @RequestParam groupId: Int,
        @Parameter(description = METADATA_FILE_DESCRIPTION) @RequestParam metadataFile: MultipartFile,
        @Parameter(description = SEQUENCE_FILE_DESCRIPTION) @RequestParam sequenceFile: MultipartFile?,
        @Parameter(
            description =
            "Data Use terms under which data is released. Mandatory when data use terms are enabled for this Instance.",
        ) @RequestParam dataUseTermsType: DataUseTermsType?,
        @Parameter(
            description =
            "Mandatory when data use terms are set to 'RESTRICTED'." +
                " It is the date when the sequence entries will become 'OPEN'." +
                " Format: YYYY-MM-DD",
        ) @RequestParam restrictedUntil: String?,
        @Parameter(description = FILE_MAPPING_DESCRIPTION) @RequestPart(required = false) fileMapping: String?,
    ): List<SubmissionIdMapping> {
        groupManagementPreconditionValidator.validateUserIsAllowedToModifyGroup(groupId, authenticatedUser)
        val dataUseTerms = dataUseTermsPreconditionValidator.constructDataUseTermsAndValidate(
            dataUseTermsType,
            restrictedUntil,
        )
        val fileMappingParsed = parseFileMapping(fileMapping, organism)

        val params = SubmissionParams.OriginalSubmissionParams(
            organism,
            authenticatedUser,
            metadataFile,
            sequenceFile,
            fileMappingParsed,
            groupId,
            dataUseTerms,
        )
        return submitModel.processSubmissions(UUID.randomUUID().toString(), params)
    }

    @Operation(description = REVISE_DESCRIPTION)
    @ApiResponse(responseCode = "200", description = REVISE_RESPONSE_DESCRIPTION)
    @PostMapping("/revise", consumes = ["multipart/form-data"])
    fun revise(
        @PathVariable @Valid organism: Organism,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(description = REVISED_METADATA_FILE_DESCRIPTION) @RequestParam metadataFile: MultipartFile,
        @Parameter(description = SEQUENCE_FILE_DESCRIPTION) @RequestParam sequenceFile: MultipartFile?,
        @Parameter(description = FILE_MAPPING_DESCRIPTION) @RequestPart(required = false) fileMapping: String?,
    ): List<SubmissionIdMapping> {
        val fileMappingParsed = parseFileMapping(fileMapping, organism)
        val params = SubmissionParams.RevisionSubmissionParams(
            organism,
            authenticatedUser,
            metadataFile,
            sequenceFile,
            fileMappingParsed,
        )
        return submitModel.processSubmissions(UUID.randomUUID().toString(), params)
    }

    @Operation(description = GET_DATA_TO_EDIT_SEQUENCE_VERSION_DESCRIPTION)
    @GetMapping("/get-data-to-edit/{accession}/{version}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getSequenceEntryVersionToEdit(
        @PathVariable @Valid organism: Organism,
        @PathVariable accession: Accession,
        @PathVariable version: Long,
        @HiddenParam authenticatedUser: AuthenticatedUser,
    ): SequenceEntryVersionToEdit = submissionDatabaseService.getSequenceEntryVersionToEdit(
        authenticatedUser,
        AccessionVersion(accession, version),
        organism,
    )

    @Operation(description = SUBMIT_EDITED_DATA_DESCRIPTION)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PostMapping("/submit-edited-data", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun submitEditedData(
        @PathVariable @Valid organism: Organism,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestBody editedSequenceEntryData: EditedSequenceEntryData,
    ) = submissionDatabaseService.submitEditedData(authenticatedUser, editedSequenceEntryData, organism)

    @Operation(description = GET_SEQUENCES_DESCRIPTION)
    @GetMapping("/get-sequences", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getSequenceList(
        @PathVariable @Valid organism: Organism,
        @Parameter(
            description = "Filter by group ids. If not provided, all groups are considered.",
        ) @RequestParam(required = false) groupIdsFilter: List<Int>?,
        @Parameter(
            description = "Filter by status. If not provided, all statuses are considered.",
        ) @RequestParam(required = false) statusesFilter: List<Status>?,
        @Parameter(
            description = "Filter by processing result. If not provided, no filtering on processing result is done. " +
                "This only filters sequences that are actually in the PROCESSED status, and does not affect " +
                "sequences in any other status.",
        ) @RequestParam(required = false) processingResultFilter: List<ProcessingResult>?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(
            description =
            "Part of pagination parameters. Page number starts from 0. " +
                "If page or size are not provided, all sequences are returned.",
        ) @RequestParam(required = false) page: Int?,
        @Parameter(
            description =
            "Part of pagination parameters. Number of sequences per page. " +
                "If page or size are not provided, all sequences are returned.",
        ) @RequestParam(required = false) size: Int?,
    ): GetSequenceResponse = submissionDatabaseService.getSequences(
        authenticatedUser,
        organism,
        groupIdsFilter,
        statusesFilter,
        processingResultFilter,
        page,
        size,
    )

    @Operation(description = "Retrieve unprocessed metadata of submitted accession versions.")
    @ResponseStatus(HttpStatus.OK)
    @ApiResponse(
        responseCode = "200",
        description = GET_UNPROCESSED_METADATA_RESPONSE_DESCRIPTION,
        headers = [
            Header(
                name = X_TOTAL_RECORDS,
                description = "The total number of records sent in responseBody",
                schema = Schema(type = "integer"),
            ),
        ],
    )
    @GetMapping("/get-unprocessed-metadata", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getUnprocessedMetadata(
        @PathVariable @Valid organism: Organism,
        @Parameter(
            description = "The metadata fields that should be returned. If not provided, all fields are returned.",
        ) @RequestParam(required = false) fields: List<String>?,
        @Parameter(
            description = "Filter by group ids. If not provided, all groups are considered.",
        ) @RequestParam(required = false) groupIdsFilter: List<Int>?,
        @Parameter(
            description = "Filter by status. If not provided, all statuses are considered.",
        ) @RequestParam(required = false) statusesFilter: List<Status>?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestParam compression: CompressionFormat?,
    ): ResponseEntity<StreamingResponseBody> {
        val headers = HttpHeaders()
        headers.contentType = MediaType.parseMediaType(MediaType.APPLICATION_NDJSON_VALUE)
        if (compression != null) {
            headers.add(HttpHeaders.CONTENT_ENCODING, compression.compressionName)
        }

        val totalRecords = submissionDatabaseService.countUnprocessedMetadata(
            authenticatedUser,
            organism,
            groupIdsFilter?.takeIf { it.isNotEmpty() },
            statusesFilter?.takeIf { it.isNotEmpty() },
        )
        headers.add(X_TOTAL_RECORDS, totalRecords.toString())
        // TODO(https://github.com/loculus-project/loculus/issues/2778)
        // There's a possibility that the totalRecords change between the count and the actual query
        // this is not too bad, if the client ends up with a few more records than expected
        // We just need to make sure the etag used is from before the count
        // Alternatively, we could read once to file while counting and then stream the file

        val streamBody = streamTransactioned(
            compression,
            endpoint = "get-unprocessed-metadata",
            organism = organism,
        ) {
            submissionDatabaseService.streamUnprocessedMetadata(
                authenticatedUser,
                organism,
                groupIdsFilter?.takeIf { it.isNotEmpty() },
                statusesFilter?.takeIf { it.isNotEmpty() },
                fields?.takeIf { it.isNotEmpty() },
            )
        }

        return ResponseEntity(streamBody, headers, HttpStatus.OK)
    }

    @Operation(description = APPROVE_PROCESSED_DATA_DESCRIPTION)
    @ResponseStatus(HttpStatus.OK)
    @PostMapping("/approve-processed-data", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun approveProcessedData(
        @PathVariable @Valid organism: Organism,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestBody body: AccessionVersionsFilterWithApprovalScope,
    ): List<AccessionVersion> = submissionDatabaseService.approveProcessedData(
        authenticatedUser = authenticatedUser,
        accessionVersionsFilter = body.accessionVersionsFilter,
        groupIdsFilter = body.groupIdsFilter,
        submitterNamesFilter = body.submitterNamesFilter,
        organism = organism,
        scope = body.scope,
    )

    @Operation(description = REVOKE_DESCRIPTION)
    @PostMapping("/revoke", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun revoke(
        @PathVariable @Valid organism: Organism,
        @RequestBody body: AccessionsToRevokeWithComment,
        @HiddenParam authenticatedUser: AuthenticatedUser,
    ): List<SubmissionIdMapping> =
        submissionDatabaseService.revoke(body.accessions, authenticatedUser, organism, body.versionComment)

    @Operation(description = DELETE_SEQUENCES_DESCRIPTION)
    @ResponseStatus(HttpStatus.OK)
    @DeleteMapping(
        "/delete-sequence-entry-versions",
    )
    fun deleteSequence(
        @PathVariable @Valid organism: Organism,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestBody body: AccessionVersionsFilterWithDeletionScope,
    ): List<AccessionVersion> = submissionDatabaseService.deleteSequenceEntryVersions(
        body.accessionVersionsFilter,
        authenticatedUser,
        body.groupIdsFilter,
        organism,
        body.scope,
    )

    fun parseFileMapping(fileMapping: String?, organism: Organism): SubmissionIdFilesMap? {
        val fileMappingParsed = fileMapping?.let {
            if (!backendConfig.getInstanceConfig(organism).schema.submissionDataTypes.files.enabled) {
                throw BadRequestException("the ${organism.name} organism does not support file submission.")
            }
            try {
                objectMapper.readValue<SubmissionIdFilesMap>(it)
            } catch (e: Exception) {
                throw BadRequestException("Failed to parse file mapping.", e)
            }
        }
        return fileMappingParsed
    }
}
