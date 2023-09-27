package org.pathoplexus.backend.model

import org.apache.commons.csv.CSVFormat
import org.apache.commons.csv.CSVParser
import org.pathoplexus.backend.service.DatabaseService
import org.pathoplexus.backend.service.OriginalData
import org.pathoplexus.backend.service.SubmittedData
import org.pathoplexus.backend.utils.FastaReader
import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile
import java.io.InputStreamReader

private const val HEADER_TO_CONNECT_METADATA_AND_SEQUENCES = "header"

@Service
class SubmitModel(private val databaseService: DatabaseService) {
    fun processSubmission(
        username: String,
        metadataFile: MultipartFile,
        sequenceFile: MultipartFile,
    ): List<HeaderId> {
        val submittedData = processFiles(metadataFile, sequenceFile)

        return databaseService.insertSubmissions(username, submittedData)
    }

    private fun processFiles(
        metadataFile: MultipartFile,
        sequenceFile: MultipartFile,
    ): List<SubmittedData> {
        val metadataMap = metadataMap(metadataFile)
        val sequenceMap = sequenceMap(sequenceFile)

        val metadataKeysSet = metadataMap.keys.toSet()
        val sequenceKeysSet = sequenceMap.keys.toSet()
        val metadataKeysNotInSequences = metadataKeysSet.subtract(sequenceKeysSet)
        if (metadataKeysNotInSequences.isNotEmpty()) {
            throw InvalidSequenceFileException(
                "Metadata file contains headers that are not present in the sequence file: " +
                    metadataKeysNotInSequences,
            )
        }

        val sequenceKeysNotInMetadata = sequenceKeysSet.subtract(metadataKeysSet)
        if (sequenceKeysNotInMetadata.isNotEmpty()) {
            throw InvalidSequenceFileException(
                "Sequence file contains headers that are not present in the metadata file: " +
                    sequenceKeysNotInMetadata,
            )
        }

        return metadataMap.map { entry ->
            SubmittedData(entry.key, OriginalData(entry.value, mapOf("main" to sequenceMap[entry.key]!!)))
        }
    }

    private fun metadataMap(metadataFile: MultipartFile): Map<String, Map<String, String>> {
        if (metadataFile.originalFilename == null || !metadataFile.originalFilename?.endsWith(".tsv")!!) {
            throw InvalidSequenceFileException("Metadata file must have extension .tsv")
        }

        val csvParser = CSVParser(
            InputStreamReader(metadataFile.inputStream),
            CSVFormat.TDF.builder().setHeader().setSkipHeaderRecord(true).build(),
        )

        if (!csvParser.headerNames.contains(HEADER_TO_CONNECT_METADATA_AND_SEQUENCES)) {
            throw InvalidSequenceFileException(
                "The metadata file does not contain the header '$HEADER_TO_CONNECT_METADATA_AND_SEQUENCES'",
            )
        }

        val metadataList = csvParser.map { it.toMap() }

        val metadataMap = metadataList.associate {
            if (it[HEADER_TO_CONNECT_METADATA_AND_SEQUENCES].isNullOrEmpty()) {
                throw InvalidSequenceFileException(
                    "A row in metadata file contains no $HEADER_TO_CONNECT_METADATA_AND_SEQUENCES: $it",
                )
            }
            it[HEADER_TO_CONNECT_METADATA_AND_SEQUENCES]!! to it.filterKeys { column ->
                column != HEADER_TO_CONNECT_METADATA_AND_SEQUENCES
            }
        }

        if (metadataMap.size != metadataList.size) {
            val duplicateKeys = metadataList.map { it[HEADER_TO_CONNECT_METADATA_AND_SEQUENCES] }
                .groupingBy { it }
                .eachCount()
                .filter { it.value > 1 }
                .keys

            throw InvalidSequenceFileException(
                "Metadata file contains duplicate ${HEADER_TO_CONNECT_METADATA_AND_SEQUENCES}s: $duplicateKeys",
            )
        }
        return metadataMap
    }

    private fun sequenceMap(sequenceFile: MultipartFile): Map<String, String> {
        if (sequenceFile.originalFilename == null || !sequenceFile.originalFilename?.endsWith(".fasta")!!) {
            throw InvalidSequenceFileException("Sequence file must have extension .fasta")
        }

        val fastaList = FastaReader(sequenceFile.bytes.inputStream()).toList()
        val sequenceMap = fastaList.associate {
            it.sampleName to it.sequence
        }

        if (sequenceMap.size != fastaList.size) {
            val duplicateKeys = fastaList.map { it.sampleName }
                .groupingBy { it }
                .eachCount()
                .filter { it.value > 1 }
                .keys

            throw InvalidSequenceFileException("Sequence file contains duplicate headers: $duplicateKeys")
        }
        return sequenceMap
    }
}

class InvalidSequenceFileException(message: String) : Exception(message)
