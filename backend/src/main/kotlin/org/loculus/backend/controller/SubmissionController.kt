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
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.Accessions
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsType
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.SequenceEntryStatus
import org.loculus.backend.api.SequenceEntryVersionToEdit
import org.loculus.backend.api.SubmissionIdMapping
import org.loculus.backend.api.SubmittedProcessedData
import org.loculus.backend.api.UnprocessedData
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
import org.springframework.security.core.annotation.AuthenticationPrincipal
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
        @UsernameFromJwt username: String,
        @Parameter(description = GROUP_DESCRIPTION) @RequestParam groupName: String,
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
            username,
            metadataFile,
            sequenceFile,
            groupName,
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
        @UsernameFromJwt username: String,
        @Parameter(
            description = REVISED_METADATA_FILE_DESCRIPTION,
        ) @RequestParam metadataFile: MultipartFile,
        @Parameter(
            description = SEQUENCE_FILE_DESCRIPTION,
        ) @RequestParam sequenceFile: MultipartFile,
    ): List<SubmissionIdMapping> {
        val params = SubmissionParams.RevisionSubmissionParams(
            organism,
            username,
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
    ): ResponseEntity<StreamingResponseBody> {
        val headers = HttpHeaders()
        headers.contentType = MediaType.parseMediaType(MediaType.APPLICATION_NDJSON_VALUE)

        val streamBody =
            stream { submissionDatabaseService.streamUnprocessedSubmissions(numberOfSequenceEntries, organism) }
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
    )
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @ApiResponse(responseCode = "400", description = "On invalid NDJSON line. Rolls back the whole transaction.")
    @ApiResponse(responseCode = "422", description = SUBMIT_PROCESSED_DATA_ERROR_RESPONSE_DESCRIPTION)
    @PostMapping("/submit-processed-data", consumes = [MediaType.APPLICATION_NDJSON_VALUE])
    fun submitProcessedData(
        @PathVariable @Valid
        organism: Organism,
        request: HttpServletRequest,
    ) = submissionDatabaseService.updateProcessedData(request.inputStream, organism)

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
        @PathVariable @Valid
        organism: Organism,
    ): ResponseEntity<StreamingResponseBody> {
        val headers = HttpHeaders()
        headers.contentType = MediaType.parseMediaType(MediaType.APPLICATION_NDJSON_VALUE)

        val streamBody = stream { releasedDataModel.getReleasedData(organism) }

        return ResponseEntity(streamBody, headers, HttpStatus.OK)
    }

    @Operation(description = GET_DATA_TO_EDIT_DESCRIPTION)
    @GetMapping("/get-data-to-edit", produces = [MediaType.APPLICATION_NDJSON_VALUE])
    fun getDataToEdit(
        @PathVariable @Valid
        organism: Organism,
        @UsernameFromJwt username: String,
        @Parameter(
            description = GROUP_DESCRIPTION,
        ) @RequestParam groupName: String,
        @Max(
            value = MAX_EXTRACTED_SEQUENCE_ENTRIES,
            message = "You can extract at max $MAX_EXTRACTED_SEQUENCE_ENTRIES sequence entries at once.",
        )
        numberOfSequenceEntries: Int,
    ): ResponseEntity<StreamingResponseBody> {
        val headers = HttpHeaders()
        headers.contentType = MediaType.parseMediaType(MediaType.APPLICATION_NDJSON_VALUE)

        val entries = submissionDatabaseService.streamDataToEdit(username, groupName, numberOfSequenceEntries, organism)
        val streamBody = stream { entries }

        return ResponseEntity(streamBody, headers, HttpStatus.OK)
    }

    @Operation(description = GET_DATA_TO_EDIT_SEQUENCE_VERSION_DESCRIPTION)
    @GetMapping("/get-data-to-edit/{accession}/{version}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getSequenceEntryVersionToEdit(
        @PathVariable @Valid
        organism: Organism,
        @PathVariable accession: Accession,
        @PathVariable version: Long,
        @UsernameFromJwt username: String,
    ): SequenceEntryVersionToEdit = submissionDatabaseService.getSequenceEntryVersionToEdit(
        username,
        AccessionVersion(accession, version),
        organism,
    )

    @Operation(description = SUBMIT_EDITED_DATA_DESCRIPTION)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PostMapping("/submit-edited-data", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun submitEditedData(
        @PathVariable @Valid
        organism: Organism,
        @UsernameFromJwt username: String,
        @RequestBody accessionVersion: UnprocessedData,
    ) = submissionDatabaseService.submitEditedData(username, accessionVersion, organism)

    @Operation(description = GET_SEQUENCES_OF_USER_DESCRIPTION)
    @GetMapping("/get-sequences-of-user", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getUserSequenceList(
        @PathVariable @Valid
        organism: Organism,
        @UsernameFromJwt username: String,
    ): List<SequenceEntryStatus> {
        return submissionDatabaseService.getActiveSequencesSubmittedBy(username, organism)
    }

    @Operation(description = APPROVE_PROCESSED_DATA_DESCRIPTION)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PostMapping("/approve-processed-data", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun approveProcessedData(
        @PathVariable @Valid
        organism: Organism,
        @UsernameFromJwt username: String,
        @RequestBody body: AccessionVersions,
    ) {
        submissionDatabaseService.approveProcessedData(username, body.accessionVersions, organism)
    }

    @Operation(description = REVOKE_DESCRIPTION)
    @PostMapping("/revoke", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun revoke(
        @PathVariable @Valid
        organism: Organism,
        @RequestBody body: Accessions,
        @UsernameFromJwt username: String,
    ): List<SequenceEntryStatus> = submissionDatabaseService.revoke(body.accessions, username, organism)

    @Operation(description = CONFIRM_REVOCATION_DESCRIPTION)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PostMapping("/confirm-revocation")
    fun confirmRevocation(
        @PathVariable @Valid
        organism: Organism,
        @UsernameFromJwt username: String,
        @RequestBody body: AccessionVersions,
    ) = submissionDatabaseService.confirmRevocation(body.accessionVersions, username, organism)

    @Operation(description = DELETE_SEQUENCES_DESCRIPTION)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @DeleteMapping(
        "/delete-sequence-entry-versions",
    )
    fun deleteSequence(
        @PathVariable @Valid
        organism: Organism,
        @UsernameFromJwt username: String,
        @RequestBody body: AccessionVersions,
    ) = submissionDatabaseService.deleteSequenceEntryVersions(body.accessionVersions, username, organism)

    private fun <T> stream(sequenceProvider: () -> Sequence<T>) = StreamingResponseBody { outputStream ->
        try {
            iteratorStreamer.streamAsNdjson(sequenceProvider(), outputStream)
        } catch (e: Exception) {
            log.error(e) { "An unexpected error occurred while streaming, aborting the stream: $e" }
            outputStream.write(
                "An unexpected error occurred while streaming, aborting the stream: ${e.message}".toByteArray(),
            )
        }
    }

    data class AccessionVersions(
        val accessionVersions: List<AccessionVersion>,
    )
}

@Target(AnnotationTarget.VALUE_PARAMETER)
@Retention(AnnotationRetention.RUNTIME)
@AuthenticationPrincipal(expression = "claims[preferred_username]")
annotation class UsernameFromJwt
