package org.pathoplexus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.constraints.Max
import org.pathoplexus.backend.model.HeaderId
import org.pathoplexus.backend.model.SubmitModel
import org.pathoplexus.backend.service.DatabaseService
import org.pathoplexus.backend.service.ProcessedData
import org.pathoplexus.backend.service.SequenceReview
import org.pathoplexus.backend.service.SequenceVersion
import org.pathoplexus.backend.service.SequenceVersionStatus
import org.pathoplexus.backend.service.SubmittedProcessedData
import org.pathoplexus.backend.service.UnprocessedData
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
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import io.swagger.v3.oas.annotations.parameters.RequestBody as SwaggerRequestBody

@RestController
@Validated
class SubmissionController(
    private val submitModel: SubmitModel,
    private val databaseService: DatabaseService,
) {

    @Operation(description = "Submit data for new sequences as multipart/form-data")
    @ApiResponse(responseCode = "200", description = SUBMIT_RESPONSE_DESCRIPTION)
    @PostMapping("/submit", consumes = ["multipart/form-data"])
    fun submit(
        @Parameter(description = "The username of the submitter - until we implement authentication")
        @RequestParam
        username: String,
        @Parameter(description = METADATA_FILE_DESCRIPTION) @RequestParam metadataFile: MultipartFile,
        @Parameter(description = SEQUENCE_FILE_DESCRIPTION) @RequestParam sequenceFile: MultipartFile,
    ): List<HeaderId> {
        return submitModel.processSubmission(username, metadataFile, sequenceFile)
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
        @RequestParam
        @Max(
            value = MAX_EXTRACTED_SEQUENCES,
            message = "You can extract at max $MAX_EXTRACTED_SEQUENCES sequences at once.",
        )
        numberOfSequences: Int,
    ): ResponseEntity<StreamingResponseBody> {
        val headers = HttpHeaders()
        headers.contentType = MediaType.parseMediaType(MediaType.APPLICATION_NDJSON_VALUE)

        val streamBody = StreamingResponseBody { outputStream ->
            databaseService.streamUnprocessedSubmissions(numberOfSequences, outputStream)
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
    )
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @ApiResponse(responseCode = "400", description = "On invalid NDJSON line. Rolls back the whole transaction.")
    @ApiResponse(responseCode = "422", description = SUBMIT_PROCESSED_DATA_ERROR_RESPONSE_DESCRIPTION)
    @PostMapping("/submit-processed-data", consumes = [MediaType.APPLICATION_NDJSON_VALUE])
    fun submitProcessedData(
        request: HttpServletRequest,
    ) = databaseService.updateProcessedData(request.inputStream)

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
    fun getReleasedData(): ResponseEntity<StreamingResponseBody> {
        val headers = HttpHeaders()
        headers.contentType = MediaType.parseMediaType(MediaType.APPLICATION_NDJSON_VALUE)

        val streamBody = StreamingResponseBody { outputStream ->
            databaseService.streamReleasedSubmissions(outputStream)
        }

        return ResponseEntity(streamBody, headers, HttpStatus.OK)
    }

    @Operation(description = GET_DATA_TO_REVIEW_DESCRIPTION)
    @GetMapping("/get-data-to-review", produces = [MediaType.APPLICATION_NDJSON_VALUE])
    fun getReviewNeededData(
        @RequestParam username: String,
        @Max(
            value = MAX_EXTRACTED_SEQUENCES,
            message = "You can extract at max $MAX_EXTRACTED_SEQUENCES sequences at once.",
        )
        numberOfSequences: Int,
    ): ResponseEntity<StreamingResponseBody> {
        val headers = HttpHeaders()
        headers.contentType = MediaType.parseMediaType(MediaType.APPLICATION_NDJSON_VALUE)

        val streamBody = StreamingResponseBody { outputStream ->
            databaseService.streamReviewNeededSubmissions(username, numberOfSequences, outputStream)
        }

        return ResponseEntity(streamBody, headers, HttpStatus.OK)
    }

    @Operation(description = GET_DATA_TO_REVIEW_SEQUENCE_VERSION_DESCRIPTION)
    @GetMapping("/get-data-to-review/{sequenceId}/{version}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getSequenceThatNeedsReview(
        @PathVariable sequenceId: Long,
        @PathVariable version: Long,
        @RequestParam username: String,
    ): SequenceReview =
        databaseService.getReviewData(username, SequenceVersion(sequenceId, version))

    @Operation(description = SUBMIT_REVIEWED_SEQUENCE_DESCRIPTION)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PostMapping("/submit-reviewed-sequence", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun submitReviewedSequence(
        @RequestParam username: String,
        @RequestBody sequenceVersion: UnprocessedData,
    ) = databaseService.submitReviewedSequence(username, sequenceVersion)

    @Operation(description = GET_SEQUENCES_OF_USER_DESCRIPTION)
    @GetMapping("/get-sequences-of-user", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getUserSequenceList(
        @RequestParam username: String,
    ): List<SequenceVersionStatus> = databaseService.getActiveSequencesSubmittedBy(username)

    @Operation(description = APPROVE_PROCESSED_DATA_DESCRIPTION)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PostMapping("/approve-processed-data", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun approveProcessedData(
        @RequestParam username: String,
        @RequestBody body: SequenceVersions,
    ) {
        databaseService.approveProcessedData(username, body.sequenceVersions)
    }

    @Operation(description = REVISE_DESCRIPTION)
    @ApiResponse(responseCode = "200", description = REVISE_RESPONSE_DESCRIPTION)
    @PostMapping("/revise", consumes = ["multipart/form-data"])
    fun revise(
        @RequestParam username: String,
        @Parameter(
            description = REVISED_METADATA_FILE_DESCRIPTION,
        ) @RequestParam metadataFile: MultipartFile,
        @Parameter(
            description = SEQUENCE_FILE_DESCRIPTION,
        ) @RequestParam sequenceFile: MultipartFile,
    ): List<HeaderId> = submitModel.processRevision(username, metadataFile, sequenceFile)

    @Operation(description = REVOKE_DESCRIPTION)
    @PostMapping("/revoke", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun revoke(
        @RequestBody body: SequenceIdList,
        @RequestParam username: String,
    ): List<SequenceVersionStatus> = databaseService.revoke(body.sequenceIds, username)

    @Operation(description = CONFIRM_REVOCATION_DESCRIPTION)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PostMapping("/confirm-revocation")
    fun confirmRevocation(
        @RequestParam username: String,
        @RequestBody body: SequenceVersions,
    ) = databaseService.confirmRevocation(body.sequenceVersions, username)

    @Operation(description = DELETE_SEQUENCES_DESCRIPTION)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @DeleteMapping(
        "/delete-sequences",
    )
    fun deleteSequence(
        @RequestParam username: String,
        @RequestBody body: SequenceVersions,
    ) = databaseService.deleteSequences(body.sequenceVersions, username)

    data class SequenceIdList(
        val sequenceIds: List<Long>,
    )

    data class SequenceVersions(
        val sequenceVersions: List<SequenceVersion>,
    )
}
