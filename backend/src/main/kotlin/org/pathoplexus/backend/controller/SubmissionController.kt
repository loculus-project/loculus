package org.pathoplexus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.constraints.Max
import org.pathoplexus.backend.api.AccessionVersion
import org.pathoplexus.backend.api.ProcessedData
import org.pathoplexus.backend.api.SequenceEntryReview
import org.pathoplexus.backend.api.SequenceEntryStatus
import org.pathoplexus.backend.api.SubmissionIdMapping
import org.pathoplexus.backend.api.SubmittedProcessedData
import org.pathoplexus.backend.api.UnprocessedData
import org.pathoplexus.backend.model.ReleasedDataModel
import org.pathoplexus.backend.model.SubmitModel
import org.pathoplexus.backend.service.Accession
import org.pathoplexus.backend.service.DatabaseService
import org.pathoplexus.backend.utils.IteratorStreamer
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
    private val releasedDataModel: ReleasedDataModel,
    private val databaseService: DatabaseService,
    private val iteratorStreamer: IteratorStreamer,
) {

    @Operation(description = "Submit data for new sequence entries as multipart/form-data")
    @ApiResponse(responseCode = "200", description = SUBMIT_RESPONSE_DESCRIPTION)
    @PostMapping("/submit", consumes = ["multipart/form-data"])
    fun submit(
        @Parameter(description = "The username of the submitter - until we implement authentication")
        @RequestParam
        username: String,
        @Parameter(description = METADATA_FILE_DESCRIPTION) @RequestParam metadataFile: MultipartFile,
        @Parameter(description = SEQUENCE_FILE_DESCRIPTION) @RequestParam sequenceFile: MultipartFile,
    ): List<SubmissionIdMapping> {
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
            value = MAX_EXTRACTED_SEQUENCE_ENTRIES,
            message = "You can extract at max $MAX_EXTRACTED_SEQUENCE_ENTRIES sequence entries at once.",
        )
        numberOfSequenceEntries: Int,
    ): ResponseEntity<StreamingResponseBody> {
        val headers = HttpHeaders()
        headers.contentType = MediaType.parseMediaType(MediaType.APPLICATION_NDJSON_VALUE)

        val streamBody = StreamingResponseBody { outputStream ->
            databaseService.streamUnprocessedSubmissions(numberOfSequenceEntries, outputStream)
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
            iteratorStreamer.streamAsNdjson(releasedDataModel.getReleasedData(), outputStream)
        }

        return ResponseEntity(streamBody, headers, HttpStatus.OK)
    }

    @Operation(description = GET_DATA_TO_REVIEW_DESCRIPTION)
    @GetMapping("/get-data-to-review", produces = [MediaType.APPLICATION_NDJSON_VALUE])
    fun getReviewNeededData(
        @RequestParam username: String,
        @Max(
            value = MAX_EXTRACTED_SEQUENCE_ENTRIES,
            message = "You can extract at max $MAX_EXTRACTED_SEQUENCE_ENTRIES sequence entries at once.",
        )
        numberOfSequenceEntries: Int,
    ): ResponseEntity<StreamingResponseBody> {
        val headers = HttpHeaders()
        headers.contentType = MediaType.parseMediaType(MediaType.APPLICATION_NDJSON_VALUE)

        val streamBody = StreamingResponseBody { outputStream ->
            databaseService.streamReviewNeededSubmissions(username, numberOfSequenceEntries, outputStream)
        }

        return ResponseEntity(streamBody, headers, HttpStatus.OK)
    }

    @Operation(description = GET_DATA_TO_REVIEW_SEQUENCE_VERSION_DESCRIPTION)
    @GetMapping("/get-data-to-review/{accession}/{version}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getSequenceThatNeedsReview(
        @PathVariable accession: Accession,
        @PathVariable version: Long,
        @RequestParam username: String,
    ): SequenceEntryReview =
        databaseService.getReviewData(username, AccessionVersion(accession, version))

    @Operation(description = SUBMIT_REVIEWED_SEQUENCE_DESCRIPTION)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PostMapping("/submit-reviewed-sequence", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun submitReviewedSequence(
        @RequestParam username: String,
        @RequestBody accessionVersion: UnprocessedData,
    ) = databaseService.submitReviewedSequence(username, accessionVersion)

    @Operation(description = GET_SEQUENCES_OF_USER_DESCRIPTION)
    @GetMapping("/get-sequences-of-user", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getUserSequenceList(
        @RequestParam username: String,
    ): List<SequenceEntryStatus> = databaseService.getActiveSequencesSubmittedBy(username)

    @Operation(description = APPROVE_PROCESSED_DATA_DESCRIPTION)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PostMapping("/approve-processed-data", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun approveProcessedData(
        @RequestParam username: String,
        @RequestBody body: AccessionVersions,
    ) {
        databaseService.approveProcessedData(username, body.accessionVersions)
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
    ): List<SubmissionIdMapping> = submitModel.processRevision(username, metadataFile, sequenceFile)

    @Operation(description = REVOKE_DESCRIPTION)
    @PostMapping("/revoke", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun revoke(
        @RequestBody body: Accessions,
        @RequestParam username: String,
    ): List<SequenceEntryStatus> = databaseService.revoke(body.accessions, username)

    @Operation(description = CONFIRM_REVOCATION_DESCRIPTION)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PostMapping("/confirm-revocation")
    fun confirmRevocation(
        @RequestParam username: String,
        @RequestBody body: AccessionVersions,
    ) = databaseService.confirmRevocation(body.accessionVersions, username)

    @Operation(description = DELETE_SEQUENCES_DESCRIPTION)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @DeleteMapping(
        "/delete-sequences",
    )
    fun deleteSequence(
        @RequestParam username: String,
        @RequestBody body: AccessionVersions,
    ) = databaseService.deleteSequences(body.accessionVersions, username)

    data class Accessions(
        val accessions: List<Accession>,
    )

    data class AccessionVersions(
        val accessionVersions: List<AccessionVersion>,
    )
}
