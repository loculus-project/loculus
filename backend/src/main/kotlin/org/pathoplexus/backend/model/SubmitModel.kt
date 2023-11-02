package org.pathoplexus.backend.model

import org.apache.commons.csv.CSVFormat
import org.apache.commons.csv.CSVParser
import org.pathoplexus.backend.api.HeaderId
import org.pathoplexus.backend.api.OriginalData
import org.pathoplexus.backend.api.RevisedData
import org.pathoplexus.backend.api.SubmittedData
import org.pathoplexus.backend.config.ReferenceGenome
import org.pathoplexus.backend.controller.BadRequestException
import org.pathoplexus.backend.controller.UnprocessableEntityException
import org.pathoplexus.backend.service.DatabaseService
import org.pathoplexus.backend.service.SequenceId
import org.pathoplexus.backend.utils.FastaReader
import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile
import java.io.InputStreamReader

private const val HEADER_TO_CONNECT_METADATA_AND_SEQUENCES = "header"
private const val SEQUENCE_ID_HEADER = "sequenceId"

typealias CustomId = String
typealias SegmentName = String

@Service
class SubmitModel(private val databaseService: DatabaseService, private val referenceGenome: ReferenceGenome) {
    fun processSubmission(
        username: String,
        metadataFile: MultipartFile,
        sequenceFile: MultipartFile,
    ): List<HeaderId> {
        val submittedData = processSubmittedFiles(metadataFile, sequenceFile)

        return databaseService.insertSubmissions(username, submittedData)
    }

    fun processRevision(
        username: String,
        metadataFile: MultipartFile,
        sequenceFile: MultipartFile,
    ): List<HeaderId> {
        val revisedData = processRevisedData(metadataFile, sequenceFile)

        return databaseService.reviseData(username, revisedData)
    }

    private fun processSubmittedFiles(
        metadataFile: MultipartFile,
        sequenceFile: MultipartFile,
    ): List<SubmittedData> {
        val metadataMap = metadataMap(metadataFile)
        val sequenceMap = sequenceMap(sequenceFile)

        validateHeaders(metadataMap, sequenceMap)

        return metadataMap.map { entry ->
            SubmittedData(entry.key, OriginalData(entry.value, sequenceMap[entry.key]!!))
        }
    }

    private fun processRevisedData(
        metadataFile: MultipartFile,
        sequenceFile: MultipartFile,
    ): List<RevisedData> {
        val metadataMap = metadataMap(metadataFile)
        val metadataMapWithoutSequenceId =
            metadataMap.mapValues { it.value.filterKeys { column -> column != SEQUENCE_ID_HEADER } }
        val sequenceMap = sequenceMap(sequenceFile)
        validateHeaders(metadataMapWithoutSequenceId, sequenceMap)

        val sequenceIdMap = sequenceIdMap(metadataMap)

        return metadataMapWithoutSequenceId.map { entry ->
            RevisedData(
                entry.key,
                sequenceIdMap[entry.key]!!,
                OriginalData(entry.value, sequenceMap[entry.key]!!),
            )
        }
    }

    private fun validateHeaders(
        metadataMap: Map<CustomId, Map<String, String>>,
        sequenceMap: Map<CustomId, Map<SegmentName, String>>,
    ) {
        val metadataKeysSet = metadataMap.keys.toSet()
        val sequenceKeysSet = sequenceMap.keys.toSet()
        val metadataKeysNotInSequences = metadataKeysSet.subtract(sequenceKeysSet)
        if (metadataKeysNotInSequences.isNotEmpty()) {
            throw UnprocessableEntityException(
                "Metadata file contains headers that are not present in the sequence file: " +
                    metadataKeysNotInSequences,
            )
        }

        val sequenceKeysNotInMetadata = sequenceKeysSet.subtract(metadataKeysSet)
        if (sequenceKeysNotInMetadata.isNotEmpty()) {
            throw UnprocessableEntityException(
                "Sequence file contains headers that are not present in the metadata file: " +
                    sequenceKeysNotInMetadata,
            )
        }
    }

    private fun metadataMap(metadataFile: MultipartFile): Map<CustomId, Map<String, String>> {
        if (metadataFile.originalFilename == null || !metadataFile.originalFilename?.endsWith(".tsv")!!) {
            throw BadRequestException("Metadata file must have extension .tsv")
        }

        val csvParser = CSVParser(
            InputStreamReader(metadataFile.inputStream),
            CSVFormat.TDF.builder().setHeader().setSkipHeaderRecord(true).build(),
        )

        if (!csvParser.headerNames.contains(HEADER_TO_CONNECT_METADATA_AND_SEQUENCES)) {
            throw UnprocessableEntityException(
                "The metadata file does not contain the header '$HEADER_TO_CONNECT_METADATA_AND_SEQUENCES'",
            )
        }

        val metadataList = csvParser.map { it.toMap() }

        val metadataMap = metadataList.associate {
            if (it[HEADER_TO_CONNECT_METADATA_AND_SEQUENCES].isNullOrEmpty()) {
                throw UnprocessableEntityException(
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

            throw UnprocessableEntityException(
                "Metadata file contains duplicate ${HEADER_TO_CONNECT_METADATA_AND_SEQUENCES}s: $duplicateKeys",
            )
        }
        return metadataMap
    }

    private fun sequenceIdMap(metadataMap: Map<CustomId, Map<String, String>>): Map<CustomId, SequenceId> {
        if (metadataMap.values.any { !it.keys.contains(SEQUENCE_ID_HEADER) }) {
            throw UnprocessableEntityException(
                "Metadata file misses header $SEQUENCE_ID_HEADER",
            )
        }

        return metadataMap.map {
            if (it.value[SEQUENCE_ID_HEADER].isNullOrEmpty()) {
                throw UnprocessableEntityException(
                    "A row with header '${it.key}' in metadata file contains no $SEQUENCE_ID_HEADER",
                )
            }
            if (it.value[SEQUENCE_ID_HEADER]!!.toLongOrNull() == null) {
                throw UnprocessableEntityException(
                    "A row with header '${it.key}' in metadata file contains no valid $SEQUENCE_ID_HEADER: " +
                        "${it.value[SEQUENCE_ID_HEADER]}",
                )
            }
            it.key to it.value[SEQUENCE_ID_HEADER]!!
        }.toMap()
    }

    private fun sequenceMap(sequenceFile: MultipartFile): Map<CustomId, Map<SegmentName, String>> {
        if (sequenceFile.originalFilename == null || !sequenceFile.originalFilename?.endsWith(".fasta")!!) {
            throw BadRequestException("Sequence file must have extension .fasta")
        }

        val fastaList = FastaReader(sequenceFile.bytes.inputStream()).toList()
        val sequenceMap = mutableMapOf<CustomId, MutableMap<SegmentName, String>>()
        fastaList.forEach {
            val (sampleName, segmentName) = parseFastaHeader(it.sampleName)
            val segmentMap = sequenceMap.getOrPut(sampleName) { mutableMapOf() }
            if (segmentMap.containsKey(segmentName)) {
                throw UnprocessableEntityException("Sequence file contains duplicate headers: ${it.sampleName}")
            }
            segmentMap[segmentName] = it.sequence
        }
        return sequenceMap
    }

    private fun parseFastaHeader(header: String): Pair<CustomId, SegmentName> {
        if (referenceGenome.nucleotideSequences.size == 1) {
            return Pair(header, "main")
        }

        val lastDelimiter = header.lastIndexOf("_")
        if (lastDelimiter == -1) {
            throw BadRequestException(
                "The FASTA header $header does not contain the segment name. Please provide the" +
                    " segment name in the format <header>_<segment name>",
            )
        }
        return Pair(header.substring(0, lastDelimiter), header.substring(lastDelimiter + 1))
    }
}
