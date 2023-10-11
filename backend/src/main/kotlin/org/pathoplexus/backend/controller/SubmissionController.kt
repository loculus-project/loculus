package org.pathoplexus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.constraints.Max
import org.apache.commons.csv.CSVFormat
import org.apache.commons.csv.CSVParser
import org.pathoplexus.backend.model.HeaderId
import org.pathoplexus.backend.model.SubmitModel
import org.pathoplexus.backend.service.DatabaseService
import org.pathoplexus.backend.service.FileData
import org.pathoplexus.backend.service.OriginalData
import org.pathoplexus.backend.service.SequenceReview
import org.pathoplexus.backend.service.SequenceValidation
import org.pathoplexus.backend.service.SequenceVersionStatus
import org.pathoplexus.backend.service.SubmittedProcessedData
import org.pathoplexus.backend.service.UnprocessedData
import org.pathoplexus.backend.utils.FastaReader
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
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import java.io.InputStreamReader
import io.swagger.v3.oas.annotations.parameters.RequestBody as SwaggerRequestBody

private const val SUBMIT_RESPONSE_DESCRIPTION =
    "Returns a list of sequenceId, version and customId of the submitted sequences. " +
        "The customId is the (locally unique) id provided by the submitter as 'header' in the metadata file. " +
        "The version will be 1 for every sequence. " +
        "The sequenceId is the (globally unique) id that the system assigned to the sequence. " +
        "You can use this response to associate the user provided customId with the system assigned sequenceId."
private const val METADATA_FILE_DESCRIPTION =
    "A TSV (tab separated values) file containing the metadata of the submitted sequences. " +
        "The first row must contain the column names. " +
        "The field 'header' is required and must be unique within the provided dataset. " +
        "It is used to associate metadata to the sequences in the sequences fasta file."
private const val SEQUENCE_FILE_DESCRIPTION =
    "A fasta file containing the unaligned nucleotide sequences of the submitted sequences. " +
        "The header of each sequence must match the 'header' field in the metadata file."

private const val EXTRACT_UNPROCESSED_DATA_DESCRIPTION =
    "Extract unprocessed sequences. This is supposed to be used as input for the preprocessing pipeline. " +
        "Returns a stream of NDJSON and sets the status each sequence to 'PROCESSING'."
private const val EXTRACT_UNPROCESSED_DATA_RESPONSE_DESCRIPTION =
    "Sequence data as input for the preprocessing pipeline. " +
        "The schema is to be understood per line of the NDJSON stream."

private const val SUBMIT_REVIEWED_SEQUENCE_DESCRIPTION =
    "Submit a review for a sequence that corrects errors found by the preprocessing pipeline " +
        "or the user themselves. This will set the status of the sequence to " +
        "'REVIEWED' and it will be processed by the next pipeline run."

private const val MAX_EXTRACTED_SEQUENCES = 100_000L

private const val SUBMIT_PROCESSED_DATA_DESCRIPTION = """
Submit processed data as a stream of NDJSON. The schema is to be understood per line of the NDJSON stream. 
This endpoint performs some server side validation and returns the validation result for every submitted sequence.
Any server side validation errors will be appended to the 'errors' field of the sequence.
On a technical error, this endpoint will roll back all previously inserted data.
"""
private const val SUBMIT_PROCESSED_DATA_RESPONSE_DESCRIPTION = "Contains an entry for every submitted sequence."

private const val SUBMIT_PROCESSED_DATA_ERROR_RESPONSE_DESCRIPTION = """
On sequence version that cannot be written to the database, e.g. if the sequence id does not exist.
Rolls back the whole transaction.
"""

private const val GET_DATA_TO_REVIEW_DESCRIPTION = """
Get processed sequence data with errors to review as a stream of NDJSON.
This returns all sequences of the user that have the status 'REVIEW_NEEDED'.
"""

private const val GET_DATA_TO_REVIEW_SEQUENCE_VERSION_DESCRIPTION = """
Get processed sequence data with errors to review for a single sequence version.
The sequence version must be in status 'REVIEW_NEEDED' or 'PROCESSED'.
"""

private const val GET_SEQUENCES_OF_USER_DESCRIPTION = """
Get a list of submitted sequence versions and their status for the given user.
This returns the last sequence version in status SILO_READY and
the sequence version that is not 'SILO_READY' (if it exists).
"""

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
    @ApiResponse(responseCode = "200", description = SUBMIT_PROCESSED_DATA_RESPONSE_DESCRIPTION)
    @ApiResponse(responseCode = "400", description = "On invalid NDJSON line. Rolls back the whole transaction.")
    @ApiResponse(responseCode = "422", description = SUBMIT_PROCESSED_DATA_ERROR_RESPONSE_DESCRIPTION)
    @PostMapping("/submit-processed-data", consumes = [MediaType.APPLICATION_NDJSON_VALUE])
    fun submitProcessedData(
        request: HttpServletRequest,
    ): List<SequenceValidation> {
        return databaseService.updateProcessedData(request.inputStream)
    }

    // TODO(#108): temporary method to ease testing, replace later
    @Operation(description = "Get processed data as a stream of NDJSON")
    @PostMapping("/extract-processed-data", produces = [MediaType.APPLICATION_NDJSON_VALUE])
    fun getProcessedData(
        @RequestParam numberOfSequences: Int,
    ): ResponseEntity<StreamingResponseBody> {
        val headers = HttpHeaders()
        headers.contentType = MediaType.parseMediaType(MediaType.APPLICATION_NDJSON_VALUE)

        val streamBody = StreamingResponseBody { outputStream ->
            databaseService.streamProcessedSubmissions(numberOfSequences, outputStream)
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
    ): SequenceReview = databaseService.getReviewData(username, sequenceId, version)

    @Operation(description = SUBMIT_REVIEWED_SEQUENCE_DESCRIPTION)
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

    @Operation(description = "Approve that the processed data is correct")
    @PostMapping(
        "/approve-processed-data",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun approveProcessedData(
        @RequestParam username: String,
        @RequestBody body: SequenceIdList,
    ) {
        databaseService.approveProcessedData(username, body.sequenceIds)
    }

    @Operation(description = "Revise released data as a multipart/form-data")
    @PostMapping("/revise", consumes = ["multipart/form-data"])
    fun revise(
        @RequestParam username: String,
        @Parameter(
            description = "Revised metadata file that contains a column 'sequenceId' that is used " +
                "to associate the revision to the sequence that will be revised.",
        ) @RequestParam metadataFile: MultipartFile,
        @Parameter(
            description = "Nucleotide sequences in a fasta file format. " +
                "No changes to the schema compared to an initial submit.",
        ) @RequestParam sequenceFile: MultipartFile,
    ): List<HeaderId> = databaseService.reviseData(username, generateFileDataSequence(metadataFile, sequenceFile))

    @Operation(description = "Revoke existing sequence and stage it for confirmation")
    @PostMapping(
        "/revoke",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun revoke(
        @RequestBody body: SequenceIdList,
    ): List<SequenceVersionStatus> = databaseService.revoke(body.sequenceIds)

    @Operation(description = "Confirm revocation of sequence")
    @PostMapping(
        "/confirm-revocation",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun confirmRevocation(
        @RequestBody body: SequenceIdList,
    ) = databaseService.confirmRevocation(body.sequenceIds)

    @Operation(description = "Delete sequence data from user")
    @DeleteMapping(
        "/delete-user-sequences",
    )
    fun deleteUserData(
        @RequestParam username: String,
    ) {
        databaseService.deleteUserSequences(username)
    }

    @Operation(description = "Delete sequences")
    @DeleteMapping(
        "/delete-sequences",
    )
    fun deleteSequence(
        @RequestParam sequenceIds: List<Long>,
    ) {
        databaseService.deleteSequences(sequenceIds)
    }

    data class SequenceIdList(
        val sequenceIds: List<Long>,
    )

    private fun generateFileDataSequence(
        metadataFile: MultipartFile,
        sequenceFile: MultipartFile,
    ): Sequence<FileData> {
        val fastaList = FastaReader(sequenceFile.bytes.inputStream()).toList()
        val sequenceMap = fastaList.associate { it.sampleName to it.sequence }

        return CSVParser(
            InputStreamReader(metadataFile.inputStream),
            CSVFormat.TDF.builder().setHeader().setSkipHeaderRecord(true).build(),
        ).asSequence().map { line ->
            // TODO The errors do not work. Use throw
            val customId = line["header"] ?: error("Missing header field")
            val sequenceId = line["sequenceId"]?.toLong() ?: error("Missing sequenceId field")
            val metadata = line.toMap().filterKeys { it != "header" }
            val sequence = sequenceMap[customId] ?: error("Missing sequence for header $customId")

            FileData(customId, sequenceId, OriginalData(metadata, mapOf("main" to sequence)))
        }
    }
}
