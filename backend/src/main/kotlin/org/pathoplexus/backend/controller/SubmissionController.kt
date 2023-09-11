package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.ExampleObject
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.servlet.http.HttpServletRequest
import org.apache.commons.csv.CSVFormat
import org.apache.commons.csv.CSVParser
import org.pathoplexus.backend.model.HeaderId
import org.pathoplexus.backend.service.DatabaseService
import org.pathoplexus.backend.service.FileData
import org.pathoplexus.backend.service.RevisionResult
import org.pathoplexus.backend.service.SequenceVersion
import org.pathoplexus.backend.service.SequenceVersionStatus
import org.pathoplexus.backend.service.ValidationResult
import org.pathoplexus.backend.utils.FastaReader
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import java.io.InputStreamReader
import io.swagger.v3.oas.annotations.parameters.RequestBody as SwaggerRequestBody

@RestController
class SubmissionController(
    private val databaseService: DatabaseService,
    private val objectMapper: ObjectMapper,
) {

    @Operation(description = "Submit unprocessed data as a multipart/form-data")
    @PostMapping("/submit", consumes = ["multipart/form-data"])
    fun submit(
        @RequestParam username: String,
        @RequestParam metadataFile: MultipartFile,
        @RequestParam sequenceFile: MultipartFile,
    ): List<HeaderId> {
        return databaseService.insertSubmissions(username, processFiles(metadataFile, sequenceFile))
    }

    @Operation(description = "Get unprocessed data as a stream of NDJSON")
    @PostMapping("/extract-unprocessed-data", produces = [MediaType.APPLICATION_NDJSON_VALUE])
    fun getUnprocessedData(
        @RequestParam numberOfSequences: Int,
    ): ResponseEntity<StreamingResponseBody> {
        val headers = HttpHeaders()
        headers.contentType = MediaType.parseMediaType(MediaType.APPLICATION_NDJSON_VALUE)

        val streamBody = StreamingResponseBody { outputStream ->
            databaseService.streamUnprocessedSubmissions(numberOfSequences, outputStream)
        }

        return ResponseEntity(streamBody, headers, HttpStatus.OK)
    }

    @Operation(
        description = "Submit processed data as a stream of NDJSON",
        requestBody = SwaggerRequestBody(
            content = [
                Content(
                    mediaType = MediaType.APPLICATION_NDJSON_VALUE,
                    schema = Schema(implementation = SequenceVersion::class),
                    examples = [
                        ExampleObject(
                            name = "Example for submitting processed sequences. \n" +
                                " NOTE: Due to formatting issues with swagger, remove all newlines from the example.",
                            value = """{"sequenceId":"4","version":"1",data":{"date":"2020-12-25","host":"Homo sapiens","region":"Europe","country":"Switzerland","division":"Schaffhausen", "nucleotideSequences":{"main":"NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNAGATC..."}}}""", // ktlint-disable max-line-length
                            summary = "Processed data (remove all newlines from the example)",
                        ),
                        ExampleObject(
                            name = "Example for submitting processed sequences with errors. \n" +
                                " NOTE: Due to formatting issues with swagger, remove all newlines from the example.",
                            value = """{"sequenceId":"4","version":"1","data":{"errors":[{"field":"host",message:"Not that kind of host"}],"date":"2020-12-25","host":"google.com","region":"Europe","country":"Switzerland","division":"Schaffhausen", "nucleotideSequences":{"main":"NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNAGATC..."}}}""", // ktlint-disable max-line-length
                            summary = "Processed data with errors (remove all newlines from the example)",
                        ),
                    ],
                ),
            ],
        ),
    )
    @PostMapping("/submit-processed-data", consumes = [MediaType.APPLICATION_NDJSON_VALUE])
    fun submitProcessedData(
        request: HttpServletRequest,
    ): List<ValidationResult> {
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

    @Operation(description = "Get data with errors to review as a stream of NDJSON")
    @GetMapping("/get-data-to-review", produces = [MediaType.APPLICATION_NDJSON_VALUE])
    fun getReviewNeededData(
        @RequestParam submitter: String,
        @RequestParam numberOfSequences: Int,
    ): ResponseEntity<StreamingResponseBody> {
        val headers = HttpHeaders()
        headers.contentType = MediaType.parseMediaType(MediaType.APPLICATION_NDJSON_VALUE)

        val streamBody = StreamingResponseBody { outputStream ->
            databaseService.streamNeededReviewSubmissions(submitter, numberOfSequences, outputStream)
        }

        return ResponseEntity(streamBody, headers, HttpStatus.OK)
    }

    @Operation(description = "Get a list of all submitted sequences of the given user")
    @GetMapping("/get-sequences-of-user", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getUserSequenceList(
        @RequestParam username: String,
    ): List<SequenceVersionStatus> {
        return databaseService.getSequencesSubmittedBy(username)
    }

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
        )@RequestParam metadataFile: MultipartFile,
        @Parameter(
            description = "Nucleotide sequences in a fasta file format. " +
                "No changes to the schema compared to an initial submit.",
        )@RequestParam sequenceFile: MultipartFile,
    ): List<RevisionResult> {
        return databaseService.reviseData(username, generateFileDataSequence(metadataFile, sequenceFile))
    }

    @Operation(description = "Revoke existing sequence and stage it for confirmation")
    @PostMapping(
        "/revoke",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun revokeData(
        @RequestBody body: SequenceIdList,
    ): List<SequenceVersionStatus> = databaseService.revokeData(body.sequenceIds)

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

    private fun processFiles(
        metadataFile: MultipartFile,
        sequenceFile: MultipartFile,
    ): List<Pair<String, String>> {
        val metadataList = CSVParser(
            InputStreamReader(metadataFile.inputStream),
            CSVFormat.TDF.builder().setHeader().setSkipHeaderRecord(true).build(),
        ).map { it.toMap() }
        val fastaList = FastaReader(sequenceFile.bytes.inputStream()).toList()
        val sequenceMap = fastaList.associate { it.sampleName to it.sequence }

        return metadataList.map { entry ->
            val header = entry["header"] ?: error("Missing header field")
            val metadata = entry.filterKeys { it != "header" }
            val result = mapOf(
                "metadata" to metadata,
                "unalignedNucleotideSequences" to mapOf("main" to sequenceMap[header]),
            )
            Pair(header, objectMapper.writeValueAsString(result))
        }
    }

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
            val header = line["header"] ?: error("Missing header field")
            val sequenceId = line["sequenceId"]?.toLong() ?: error("Missing sequenceId field")
            val metadata = line.toMap().filterKeys { it != "header" }
            val unprocessedData = mapOf(
                "metadata" to metadata,
                "unalignedNucleotideSequences" to mapOf("main" to sequenceMap[header]),
            )
            FileData(header, sequenceId, objectMapper.valueToTree(unprocessedData))
        }
    }
}
