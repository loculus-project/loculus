package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.ExampleObject
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.parameters.RequestBody
import jakarta.servlet.http.HttpServletRequest
import org.apache.commons.csv.CSVFormat
import org.apache.commons.csv.CSVParser
import org.pathoplexus.backend.model.HeaderId
import org.pathoplexus.backend.service.DatabaseService
import org.pathoplexus.backend.service.Sequence
import org.pathoplexus.backend.service.SequenceStatus
import org.pathoplexus.backend.service.ValidationResult
import org.pathoplexus.backend.utils.FastaReader
import org.springframework.context.annotation.Description
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import java.io.InputStreamReader

@RestController
class SubmissionController(
    private val databaseService: DatabaseService,
    private val objectMapper: ObjectMapper,
) {

    @Description("Submit unprocessed data as a multipart/form-data")
    @PostMapping("/submit", consumes = ["multipart/form-data"])
    fun submit(
        @RequestParam username: String,
        @RequestParam metadataFile: MultipartFile,
        @RequestParam sequenceFile: MultipartFile,
    ): List<HeaderId> {
        return databaseService.insertSubmissions(username, processFiles(metadataFile, sequenceFile))
    }

    @Description("Get unprocessed data as a stream of NDJSON")
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

    @Description("Submit processed data as a stream of NDJSON")
    @Operation(
        requestBody = RequestBody(
            content = [
                Content(
                    mediaType = MediaType.APPLICATION_NDJSON_VALUE,
                    schema = Schema(implementation = Sequence::class),
                    examples = [
                        ExampleObject(
                            name = "Example for submitting processed sequences. \n" +
                                " NOTE: Due to formatting issues with swagger, remove all newlines from the example.",
                            value = """{"sequenceId":"4","data":{"date":"2020-12-25","host":"Homo sapiens","region":"Europe","country":"Switzerland","division":"Schaffhausen", "nucleotideSequences":{"main":"NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNAGATC..."}}}""", // ktlint-disable max-line-length
                            summary = "Processed data (remove all newlines from the example)",
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
    @Description("Get processed data as a stream of NDJSON")
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

    @Description("Get a list of all submitted sequences of the given user")
    @GetMapping("/get-sequences-of-user", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getUserSequenceList(
        @RequestParam username: String,
    ): List<SequenceStatus> {
        return databaseService.getSequencesSubmittedBy(username)
    }

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
            val merged = entry.toMutableMap<String, Any>().apply {
                this["nucleotideSequences"] = mapOf("main" to sequenceMap[entry["header"]])
            }

            val header = merged.remove("header") as String
            Pair(header, objectMapper.writeValueAsString(merged))
        }
    }
}
