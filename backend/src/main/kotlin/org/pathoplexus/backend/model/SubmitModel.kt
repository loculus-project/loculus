package org.pathoplexus.backend.model

import org.apache.commons.csv.CSVFormat
import org.apache.commons.csv.CSVParser
import org.pathoplexus.backend.api.OriginalData
import org.pathoplexus.backend.api.RevisedData
import org.pathoplexus.backend.api.SubmissionIdMapping
import org.pathoplexus.backend.api.SubmittedData
import org.pathoplexus.backend.config.ReferenceGenome
import org.pathoplexus.backend.controller.BadRequestException
import org.pathoplexus.backend.controller.UnprocessableEntityException
import org.pathoplexus.backend.service.Accession
import org.pathoplexus.backend.service.DatabaseService
import org.pathoplexus.backend.utils.FastaReader
import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile
import java.io.InputStreamReader

const val HEADER_TO_CONNECT_METADATA_AND_SEQUENCES = "submissionId"
private const val ACCESSION_HEADER = "accession"

typealias SubmissionId = String
typealias SegmentName = String

@Service
class SubmitModel(private val databaseService: DatabaseService, private val referenceGenome: ReferenceGenome) {
    fun processSubmission(
        username: String,
        metadataFile: MultipartFile,
        sequenceFile: MultipartFile,
    ): List<SubmissionIdMapping> {
        val submittedData = processSubmittedFiles(metadataFile, sequenceFile)

        return databaseService.insertSubmissions(username, submittedData)
    }

    fun processRevision(
        username: String,
        metadataFile: MultipartFile,
        sequenceFile: MultipartFile,
    ): List<SubmissionIdMapping> {
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
        val metadataMapWithoutAccession =
            metadataMap.mapValues { it.value.filterKeys { column -> column != ACCESSION_HEADER } }
        val sequenceMap = sequenceMap(sequenceFile)
        validateHeaders(metadataMapWithoutAccession, sequenceMap)

        val accessionMap = accessionMap(metadataMap)

        return metadataMapWithoutAccession.map { entry ->
            RevisedData(
                entry.key,
                accessionMap[entry.key]!!,
                OriginalData(entry.value, sequenceMap[entry.key]!!),
            )
        }
    }

    private fun validateHeaders(
        metadataMap: Map<SubmissionId, Map<String, String>>,
        sequenceMap: Map<SubmissionId, Map<SegmentName, String>>,
    ) {
        val metadataKeysSet = metadataMap.keys.toSet()
        val sequenceKeysSet = sequenceMap.keys.toSet()
        val metadataKeysNotInSequences = metadataKeysSet.subtract(sequenceKeysSet)
        if (metadataKeysNotInSequences.isNotEmpty()) {
            throw UnprocessableEntityException(
                "Metadata file contains submissionIds that are not present in the sequence file: " +
                    metadataKeysNotInSequences,
            )
        }

        val sequenceKeysNotInMetadata = sequenceKeysSet.subtract(metadataKeysSet)
        if (sequenceKeysNotInMetadata.isNotEmpty()) {
            throw UnprocessableEntityException(
                "Sequence file contains submissionIds that are not present in the metadata file: " +
                    sequenceKeysNotInMetadata,
            )
        }
    }

    private fun metadataMap(metadataFile: MultipartFile): Map<SubmissionId, Map<String, String>> {
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
                .sortedBy { it }

            throw UnprocessableEntityException(
                "Metadata file contains duplicate ${HEADER_TO_CONNECT_METADATA_AND_SEQUENCES}s: $duplicateKeys",
            )
        }
        return metadataMap
    }

    private fun accessionMap(metadataMap: Map<SubmissionId, Map<String, String>>): Map<SubmissionId, Accession> {
        if (metadataMap.values.any { !it.keys.contains(ACCESSION_HEADER) }) {
            throw UnprocessableEntityException(
                "Metadata file misses header $ACCESSION_HEADER",
            )
        }

        return metadataMap.map {
            if (it.value[ACCESSION_HEADER].isNullOrEmpty()) {
                throw UnprocessableEntityException(
                    "A row with header '${it.key}' in metadata file contains no $ACCESSION_HEADER",
                )
            }
            if (it.value[ACCESSION_HEADER]!!.toLongOrNull() == null) {
                throw UnprocessableEntityException(
                    "A row with header '${it.key}' in metadata file contains no valid $ACCESSION_HEADER: " +
                        "${it.value[ACCESSION_HEADER]}",
                )
            }
            it.key to it.value[ACCESSION_HEADER]!!
        }.toMap()
    }

    private fun sequenceMap(sequenceFile: MultipartFile): Map<SubmissionId, Map<SegmentName, String>> {
        if (sequenceFile.originalFilename == null || !sequenceFile.originalFilename?.endsWith(".fasta")!!) {
            throw BadRequestException("Sequence file must have extension .fasta")
        }

        val fastaList = FastaReader(sequenceFile.bytes.inputStream()).toList()
        val sequenceMap = mutableMapOf<SubmissionId, MutableMap<SegmentName, String>>()
        fastaList.forEach {
            val (sampleName, segmentName) = parseFastaHeader(it.sampleName)
            val segmentMap = sequenceMap.getOrPut(sampleName) { mutableMapOf() }
            if (segmentMap.containsKey(segmentName)) {
                throw UnprocessableEntityException("Sequence file contains duplicate submissionIds: ${it.sampleName}")
            }
            segmentMap[segmentName] = it.sequence
        }
        return sequenceMap
    }

    private fun parseFastaHeader(submissionId: String): Pair<SubmissionId, SegmentName> {
        if (referenceGenome.nucleotideSequences.size == 1) {
            return Pair(submissionId, "main")
        }

        val lastDelimiter = submissionId.lastIndexOf("_")
        if (lastDelimiter == -1) {
            throw BadRequestException(
                "The FASTA header $submissionId does not contain the segment name. Please provide the" +
                    " segment name in the format <submissionId>_<segment name>",
            )
        }
        return Pair(submissionId.substring(0, lastDelimiter), submissionId.substring(lastDelimiter + 1))
    }
}
