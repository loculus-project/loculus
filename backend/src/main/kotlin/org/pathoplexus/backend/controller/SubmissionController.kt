package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import org.apache.commons.csv.CSVFormat
import org.apache.commons.csv.CSVParser
import org.pathoplexus.backend.model.HeaderId
import org.pathoplexus.backend.service.DatabaseService
import org.pathoplexus.backend.utils.FastaReader
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import java.io.InputStreamReader

@RestController
class SubmissionController(
    private val databaseService: DatabaseService,
    private val mapper: ObjectMapper,
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
            mapper.writeValueAsString(merged)
        }

        return databaseService.insertSubmissions(username, originalDataJsons)
    }
}
