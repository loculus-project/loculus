package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import mu.KotlinLogging
import org.apache.commons.compress.compressors.zstandard.ZstdCompressorOutputStream
import org.jetbrains.exposed.sql.transactions.transaction
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionsFilterWithApprovalScope
import org.loculus.backend.api.AccessionVersionsFilterWithDeletionScope
import org.loculus.backend.api.AccessionsToRevokeWithComment
import org.loculus.backend.api.CompressionFormat
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsType
import org.loculus.backend.api.EditedSequenceEntryData
import org.loculus.backend.api.ExternalSubmittedData
import org.loculus.backend.api.GetSequenceResponse
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.SequenceEntryVersionToEdit
import org.loculus.backend.api.Status
import org.loculus.backend.api.SubmissionIdMapping
import org.loculus.backend.api.SubmittedProcessedData
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.api.WarningsFilter
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.auth.HiddenParam
import org.loculus.backend.model.ReleasedDataModel
import org.loculus.backend.model.SubmissionParams
import org.loculus.backend.model.SubmitModel
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
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import java.util.UUID
import io.swagger.v3.oas.annotations.parameters.RequestBody as SwaggerRequestBody

private val log = KotlinLogging.logger { }

@RestController
@RequestMapping("/{organism}")
@Validated
@SecurityRequirement(name = "bearerAuth")
class SubmissionController(
    private val submitModel: SubmitModel,
    private val releasedDataModel: ReleasedDataModel,
    private val submissionDatabaseService: SubmissionDatabaseService,
    private val iteratorStreamer: IteratorStreamer,
) {

    @Operation(description = SUBMIT_DESCRIPTION)
    @ApiResponse(responseCode = "200", description = SUBMIT_RESPONSE_DESCRIPTION)
    @PostMapping("/submit", consumes = ["multipart/form-data"])
    fun submit(
        @PathVariable @Valid
        organism: Organism,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(description = GROUP_ID_DESCRIPTION) @RequestParam groupId: Int,
        @Parameter(description = METADATA_FILE_DESCRIPTION) @RequestParam metadataFile: MultipartFile,
        @Parameter(description = SEQUENCE_FILE_DESCRIPTION) @RequestParam sequenceFile: MultipartFile,
        @Parameter(description = "Data Use terms under which data is released.")
        @RequestParam
        dataUseTermsType: DataUseTermsType,
        @Parameter(
            description = "Mandatory when data use terms are set to 'RESTRICTED'." +
                " It is the date when the sequence entries will become 'OPEN'." +
                " Format: YYYY-MM-DD",
        ) @RequestParam restrictedUntil: String?,
    ): List<SubmissionIdMapping> {
        val params = SubmissionParams.OriginalSubmissionParams(
            organism,
            authenticatedUser,
            metadataFile,
            sequenceFile,
            groupId,
            DataUseTerms.fromParameters(dataUseTermsType, restrictedUntil),
        )
        return submitModel.processSubmissions(UUID.randomUUID().toString(), params)
    }

    @Operation(description = REVISE_DESCRIPTION)
    @ApiResponse(responseCode = "200", description = REVISE_RESPONSE_DESCRIPTION)
    @PostMapping("/revise", consumes = ["multipart/form-data"])
    fun revise(
        @PathVariable @Valid
        organism: Organism,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(
            description = REVISED_METADATA_FILE_DESCRIPTION,
        ) @RequestParam metadataFile: MultipartFile,
        @Parameter(
            description = SEQUENCE_FILE_DESCRIPTION,
        ) @RequestParam sequenceFile: MultipartFile,
    ): List<SubmissionIdMapping> {
        val params = SubmissionParams.RevisionSubmissionParams(
            organism,
            authenticatedUser,
            metadataFile,
            sequenceFile,
        )
        return submitModel.processSubmissions(UUID.randomUUID().toString(), params)
    }

    @Operation(description = EXTRACT_UNPROCESSED_DATA_DESCRIPTION)
    @ApiResponse(
        responseCode = "200",
        description = EXTRACT_UNPROCESSED_DATA_RESPONSE_DESCRIPTION,
        content = [
            Content(
                schema = Schema(implementation = UnprocessedData::class),
            ),
        ],
    )
    @ApiResponse(responseCode = "422", description = EXTRACT_UNPROCESSED_DATA_ERROR_RESPONSE)
    @PostMapping("/extract-unprocessed-data", produces = [MediaType.APPLICATION_NDJSON_VALUE])
    fun extractUnprocessedData(
        @PathVariable @Valid
        organism: Organism,
        @RequestParam
        @Max(
            value = MAX_EXTRACTED_SEQUENCE_ENTRIES,
            message = "You can extract at max $MAX_EXTRACTED_SEQUENCE_ENTRIES sequence entries at once.",
        )
        numberOfSequenceEntries: Int,
        @RequestParam
        pipelineVersion: Long,
    ): ResponseEntity<StreamingResponseBody> {
        val currentProcessingPipelineVersion = submissionDatabaseService.getCurrentProcessingPipelineVersion()
        if (pipelineVersion < currentProcessingPipelineVersion) {
            throw UnprocessableEntityException(
                "The processing pipeline version $pipelineVersion is not accepted " +
                    "anymore. The current pipeline version is $currentProcessingPipelineVersion.",
            )
        }

        val headers = HttpHeaders()
        headers.contentType = MediaType.parseMediaType(MediaType.APPLICATION_NDJSON_VALUE)
        val streamBody = streamTransactioned {
            submissionDatabaseService.streamUnprocessedSubmissions(numberOfSequenceEntries, organism, pipelineVersion)
        }
        return ResponseEntity(streamBody, headers, HttpStatus.OK)
    }

    @Operation(
        description = SUBMIT_PROCESSED_DATA_DESCRIPTION,
        requestBody = SwaggerRequestBody(
            content = [
                Content(
                    mediaType = MediaType.APPLICATION_NDJSON_VALUE,
                    schema = Schema(implementation = SubmittedProcessedData::class),
                ),
            ],
        ),
        parameters = [
            Parameter(
                name = "pipelineVersion",
                description = "Version of the processing pipeline",
                required = true,
                schema = Schema(implementation = Int::class),
            ),
        ],
    )
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @ApiResponse(responseCode = "400", description = "On invalid NDJSON line. Rolls back the whole transaction.")
    @ApiResponse(responseCode = "422", description = SUBMIT_PROCESSED_DATA_ERROR_RESPONSE_DESCRIPTION)
    @PostMapping("/submit-processed-data", consumes = [MediaType.APPLICATION_NDJSON_VALUE])
    fun submitProcessedData(
        @PathVariable @Valid
        organism: Organism,
        @RequestParam
        pipelineVersion: Long,
        request: HttpServletRequest,
    ) = submissionDatabaseService.updateProcessedData(request.inputStream, organism, pipelineVersion)

    @Operation(
        description = SUBMIT_EXTERNAL_METADATA_DESCRIPTION,
        requestBody = SwaggerRequestBody(
            content = [
                Content(
                    mediaType = MediaType.APPLICATION_NDJSON_VALUE,
                    schema =
                    Schema(
                        implementation =
                        ExternalSubmittedData::class,
                    ),
                ),
            ],
        ),
    )
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @ApiResponse(
        responseCode = "400",
        description = "On invalid NDJSON line. Rolls back the whole transaction.",
    )
    @ApiResponse(
        responseCode = "422",
        description = SUBMIT_EXTERNAL_METADATA_ERROR_RESPONSE_DESCRIPTION,
    )
    @PostMapping("/submit-external-metadata", consumes = [MediaType.APPLICATION_NDJSON_VALUE])
    fun submitExternalMetadata(
        @PathVariable @Valid organism: Organism,
        @Parameter(
            description = (
                "Name of the pipeline submitting the external metadata update. This should match the " +
                    "externalMetadataUpdater value of the externalMetadata fields (in the backend_config.json) that are being updated."
                ),
        )
        @RequestParam externalMetadataUpdater: String,
        request: HttpServletRequest,
    ) {
        submissionDatabaseService.updateExternalMetadata(
            request.inputStream,
            organism,
            externalMetadataUpdater,
        )
    }

    @Operation(description = GET_RELEASED_DATA_DESCRIPTION)
    @ResponseStatus(HttpStatus.OK)
    @ApiResponse(
        responseCode = "200",
        description = GET_RELEASED_DATA_RESPONSE_DESCRIPTION,
        content = [
            Content(
                schema = Schema(implementation = ProcessedData::class),
            ),
        ],
    )
    @GetMapping("/get-released-data", produces = [MediaType.APPLICATION_NDJSON_VALUE])
    fun getReleasedData(
        @PathVariable @Valid organism: Organism,
        @RequestParam compression: CompressionFormat?,
    ): ResponseEntity<StreamingResponseBody> {
        val headers = HttpHeaders()
        headers.contentType = MediaType.parseMediaType(MediaType.APPLICATION_NDJSON_VALUE)
        if (compression != null) {
            headers.add(HttpHeaders.CONTENT_ENCODING, compression.compressionName)
        }

        val streamBody = streamTransactioned(compression) { releasedDataModel.getReleasedData(organism) }

        return ResponseEntity(streamBody, headers, HttpStatus.OK)
    }

    @Operation(description = GET_DATA_TO_EDIT_SEQUENCE_VERSION_DESCRIPTION)
    @GetMapping("/get-data-to-edit/{accession}/{version}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getSequenceEntryVersionToEdit(
        @PathVariable @Valid
        organism: Organism,
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
        @PathVariable @Valid
        organism: Organism,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestBody editedSequenceEntryData: EditedSequenceEntryData,
    ) = submissionDatabaseService.submitEditedData(authenticatedUser, editedSequenceEntryData, organism)

    @Operation(description = GET_SEQUENCES_DESCRIPTION)
    @GetMapping("/get-sequences", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getSequenceList(
        @PathVariable @Valid
        organism: Organism,
        @Parameter(
            description = "Filter by group ids. If not provided, all groups are considered.",
        )
        @RequestParam(required = false)
        groupIdsFilter: List<Int>?,
        @Parameter(
            description = "Filter by status. If not provided, all statuses are considered.",
        )
        @RequestParam(required = false)
        statusesFilter: List<Status>?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestParam(required = false, defaultValue = "INCLUDE_WARNINGS")
        warningsFilter: WarningsFilter,
        @Parameter(
            description = "Part of pagination parameters. Page number starts from 0. " +
                "If page or size are not provided, all sequences are returned.",
        )
        @RequestParam(required = false)
        page: Int?,
        @Parameter(
            description = "Part of pagination parameters. Number of sequences per page. " +
                "If page or size are not provided, all sequences are returned.",
        )
        @RequestParam(required = false)
        size: Int?,
    ): GetSequenceResponse = submissionDatabaseService.getSequences(
        authenticatedUser,
        organism,
        groupIdsFilter,
        statusesFilter,
        warningsFilter,
        page,
        size,
    )

    @Operation(description = "Retrieve original metadata of submitted accession versions.")
    @ResponseStatus(HttpStatus.OK)
    @ApiResponse(
        responseCode = "200",
        description = GET_ORIGINAL_METADATA_RESPONSE_DESCRIPTION,
    )
    @GetMapping("/get-original-metadata", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getOriginalMetadata(
        @PathVariable @Valid
        organism: Organism,
        @Parameter(
            description = "The metadata fields that should be returned. If not provided, all fields are returned.",
        )
        @RequestParam(required = false)
        fields: List<String>?,
        @Parameter(
            description = "Filter by group ids. If not provided, all groups are considered.",
        )
        @RequestParam(required = false)
        groupIdsFilter: List<Int>?,
        @Parameter(
            description = "Filter by status. If not provided, all statuses are considered.",
        )
        @RequestParam(required = false)
        statusesFilter: List<Status>?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestParam compression: CompressionFormat?,
    ): ResponseEntity<StreamingResponseBody> {
        val headers = HttpHeaders()
        headers.contentType = MediaType.parseMediaType(MediaType.APPLICATION_NDJSON_VALUE)
        if (compression != null) {
            headers.add(HttpHeaders.CONTENT_ENCODING, compression.compressionName)
        }

        val streamBody = streamTransactioned(compression) {
            submissionDatabaseService.streamOriginalMetadata(
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
        @PathVariable @Valid
        organism: Organism,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestBody
        body: AccessionVersionsFilterWithApprovalScope,
    ): List<AccessionVersion> = submissionDatabaseService.approveProcessedData(
        authenticatedUser = authenticatedUser,
        accessionVersionsFilter = body.accessionVersionsFilter,
        groupIdsFilter = body.groupIdsFilter,
        organism = organism,
        scope = body.scope,
    )

    @Operation(description = REVOKE_DESCRIPTION)
    @PostMapping("/revoke", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun revoke(
        @PathVariable @Valid
        organism: Organism,
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
        @PathVariable @Valid
        organism: Organism,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestBody
        body: AccessionVersionsFilterWithDeletionScope,
    ): List<AccessionVersion> = submissionDatabaseService.deleteSequenceEntryVersions(
        body.accessionVersionsFilter,
        authenticatedUser,
        body.groupIdsFilter,
        organism,
        body.scope,
    )

    private fun <T> streamTransactioned(
        compressionFormat: CompressionFormat? = null,
        sequenceProvider: () -> Sequence<T>,
    ) = StreamingResponseBody { responseBodyStream ->
        val outputStream = when (compressionFormat) {
            CompressionFormat.ZSTD -> ZstdCompressorOutputStream(responseBodyStream)
            null -> responseBodyStream
        }

        outputStream.use { stream ->
            transaction {
                try {
                    iteratorStreamer.streamAsNdjson(sequenceProvider(), stream)
                    stream.write("{}\n{}\n".toByteArray())
                } catch (e: Exception) {
                    log.error(e) { "An unexpected error occurred while streaming, aborting the stream: $e" }
                    stream.write(
                        "An unexpected error occurred while streaming, aborting the stream: ${e.message}".toByteArray(),
                    )
                }
            }
        }
    }
}
