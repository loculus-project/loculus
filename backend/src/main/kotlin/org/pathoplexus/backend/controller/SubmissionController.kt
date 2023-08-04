package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import org.apache.commons.csv.CSVFormat
import org.apache.commons.csv.CSVParser
import org.pathoplexus.backend.model.HeaderId
import org.pathoplexus.backend.service.DatabaseService
import org.pathoplexus.backend.utils.FastaReader
import org.springframework.context.annotation.Description
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
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

    @PostMapping("/submit", consumes = ["multipart/form-data"])
    fun submit(
        @RequestParam username: String,
        @RequestParam metadata: MultipartFile,
        @RequestParam sequences: MultipartFile,
    ): List<HeaderId> {
        val metadataList = CSVParser(
            InputStreamReader(metadata.inputStream),
            CSVFormat.TDF.builder().setHeader().setSkipHeaderRecord(true).build(),
        ).map { it.toMap() }
        val fastaList = FastaReader(sequences.bytes.inputStream()).toList()
        val sequenceMap = fastaList.associate { it.sampleName to it.sequence }

        val originalDataJsons = metadataList.map { entry ->
            val merged = entry.toMutableMap<String, Any>().apply {
                this["nucleotideSequences"] = mapOf("main" to sequenceMap[entry["header"]])
            }
            objectMapper.writeValueAsString(merged)
        }

        return databaseService.insertSubmissions(username, originalDataJsons)
    }

    @Description("Get unprocessed data as a stream of NDJSON")
    @PostMapping("/extract-unprocessed-data", produces = ["application/x-ndjson"])
    fun getUnprocessedData(
        @RequestParam numberOfSequences: Int,
    ): ResponseEntity<StreamingResponseBody> {
        val headers = HttpHeaders()
        headers.contentType = MediaType.parseMediaType("application/x-ndjson")

        val streamBody = StreamingResponseBody { outputStream ->
            databaseService.streamUnprocessedSubmissions(numberOfSequences, outputStream)
        }

        return ResponseEntity(streamBody, headers, HttpStatus.OK)
    }
}
