package org.pathoplexus.backend.model

import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.apache.commons.compress.archivers.zip.ZipFile
import org.apache.commons.compress.compressors.CompressorStreamFactory
import org.apache.commons.csv.CSVFormat
import org.apache.commons.csv.CSVParser
import org.jetbrains.exposed.exceptions.ExposedSQLException
import org.pathoplexus.backend.api.Organism
import org.pathoplexus.backend.api.OriginalData
import org.pathoplexus.backend.api.RevisedData
import org.pathoplexus.backend.api.SubmissionIdMapping
import org.pathoplexus.backend.controller.BadRequestException
import org.pathoplexus.backend.controller.DuplicateKeyException
import org.pathoplexus.backend.controller.UnprocessableEntityException
import org.pathoplexus.backend.service.CompressionAlgorithm
import org.pathoplexus.backend.service.DatabaseService
import org.pathoplexus.backend.service.UploadDatabaseService
import org.pathoplexus.backend.utils.Accession
import org.pathoplexus.backend.utils.FastaReader
import org.pathoplexus.backend.utils.ParseFastaHeader
import org.pathoplexus.backend.utils.metadataEntryStreamAsSequence
import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile
import java.io.BufferedInputStream
import java.io.File
import java.io.InputStream
import java.io.InputStreamReader

const val HEADER_TO_CONNECT_METADATA_AND_SEQUENCES = "submissionId"
private const val ACCESSION_HEADER = "accession"
private val log = KotlinLogging.logger { }

typealias SubmissionId = String
typealias SegmentName = String
typealias MetadataMap = Map<SubmissionId, Map<String, String>>

const val UNIQUE_CONSTRAINT_VIOLATION_SQL_STATE = "23505"

@Service
class SubmitModel(
    private val databaseService: DatabaseService,
    private val uploadDatabaseService: UploadDatabaseService,
    private val parseFastaHeader: ParseFastaHeader,
) {

    companion object AcceptedFileTypes {
        val metadataFile = ValidExtension("Metadata file", listOf("tsv"))
        val sequenceFile = ValidExtension("Sequence file", listOf("fasta"))
    }

    data class ValidExtension(
        val displayName: String,
        val validExtensions: List<String>,
    ) {
        fun getCompressedExtensions(): Map<CompressionAlgorithm, List<String>> =
            CompressionAlgorithm.entries.associateWith { algorithm ->
                validExtensions.map {
                    it + algorithm.extension
                }
            }
    }

    fun processSubmission(
        uploadId: String,
        metadataFile: MultipartFile,
        sequenceFile: MultipartFile,
        submitter: String,
        organism: Organism,
        batchSize: Int = 1000,
    ): List<SubmissionIdMapping> {
        return try {
            log.info { "Processing submission with uploadId $uploadId" }
            uploadData(submitter, uploadId, metadataFile, sequenceFile, batchSize, organism)

            log.info { "Validating submission with uploadId $uploadId" }
            val (metadataSubmissionIds, sequencesSubmissionIds) = uploadDatabaseService.getUploadSubmissionIds(uploadId)
            validateSubmissionIdSets(metadataSubmissionIds.toSet(), sequencesSubmissionIds.toSet())

            log.info { "Persisting submission with uploadId $uploadId" }
            uploadDatabaseService.mapAndCopy(uploadId)
        } finally {
            uploadDatabaseService.deleteUploadData(uploadId)
        }
    }

    private fun uploadData(
        submitter: String,
        uploadId: String,
        metadataMultipartFile: MultipartFile,
        sequenceMultipartFile: MultipartFile,
        batchSize: Int,
        organism: Organism,
    ) {
        val metadataTempFileToDelete = MaybeFile()
        val metadataStream = getStreamFromFile(metadataMultipartFile, uploadId, metadataFile, metadataTempFileToDelete)
        try {
            uploadMetadata(submitter, uploadId, metadataStream, batchSize, organism)
        } finally {
            metadataTempFileToDelete.delete()
        }

        val sequenceTempFileToDelete = MaybeFile()
        try {
            val sequenceStream = getStreamFromFile(
                sequenceMultipartFile,
                uploadId,
                sequenceFile,
                sequenceTempFileToDelete,
            )
            uploadSequences(uploadId, sequenceStream, batchSize, organism)
        } finally {
            sequenceTempFileToDelete.delete()
        }
    }

    class MaybeFile {
        var file: File? = null
        fun delete() {
            file?.delete()
        }
    }

    private fun getStreamFromFile(
        file: MultipartFile,
        uploadId: String,
        dataType: ValidExtension,
        maybeFileToDelete: MaybeFile,
    ): InputStream = when (getFileType(file, dataType)) {
        CompressionAlgorithm.ZIP -> {
            val tempFile = File.createTempFile(
                "upload_" + dataType.displayName.replace(" ", ""),
                uploadId,
            )
            maybeFileToDelete.file = tempFile

            file.transferTo(tempFile)
            val zipFile = ZipFile(tempFile)
            BufferedInputStream(zipFile.getInputStream(zipFile.entries.nextElement()))
        }

        CompressionAlgorithm.NONE ->
            BufferedInputStream(file.inputStream)

        else ->
            CompressorStreamFactory().createCompressorInputStream(
                BufferedInputStream(file.inputStream),
            )
    }

    private fun uploadMetadata(
        submitter: String,
        uploadId: String,
        metadataStream: InputStream,
        batchSize: Int,
        organism: Organism,
    ) {
        log.info {
            "intermediate storing uploaded metadata from $submitter with UploadId $uploadId"
        }
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)
        try {
            metadataEntryStreamAsSequence(metadataStream).chunked(batchSize).forEach { batch ->
                uploadDatabaseService.batchInsertMetadataInAuxTable(
                    submitter,
                    uploadId,
                    organism,
                    batch,
                    now,
                )
            }
        } catch (e: ExposedSQLException) {
            if (e.sqlState == UNIQUE_CONSTRAINT_VIOLATION_SQL_STATE) {
                throw DuplicateKeyException(
                    "Metadata file contains at least one duplicate submissionId: ${e.cause?.cause}",
                )
            }
            throw e
        }
    }

    private fun uploadSequences(
        uploadId: String,
        sequenceStream: InputStream,
        batchSize: Int,
        organism: Organism,
    ) {
        log.info {
            "intermediate storing uploaded sequence data with UploadId $uploadId"
        }
        FastaReader(sequenceStream).asSequence().chunked(batchSize).forEach { batch ->
            try {
                uploadDatabaseService.batchInsertSequencesInAuxTable(
                    uploadId,
                    organism,
                    batch,
                )
            } catch (e: ExposedSQLException) {
                if (e.sqlState == UNIQUE_CONSTRAINT_VIOLATION_SQL_STATE) {
                    throw DuplicateKeyException(
                        "Sequence file contains at least one duplicate submissionId: ${e.cause?.cause}",
                    )
                }
                throw e
            }
        }
    }

    private fun getFileType(file: MultipartFile, expectedFileType: ValidExtension): CompressionAlgorithm {
        val originalFilename = file.originalFilename
            ?: throw BadRequestException("${expectedFileType.displayName} file missing")

        expectedFileType.getCompressedExtensions().forEach { (algorithm, extensions) ->
            if (extensions.any { originalFilename.endsWith(it) }) {
                return algorithm
            }
        }

        throw BadRequestException(
            "${expectedFileType.displayName} has wrong extension. Must be " +
                ".${expectedFileType.validExtensions} for uncompressed submissions or " +
                ".${expectedFileType.getCompressedExtensions()} for compressed submissions",
        )
    }

    fun processRevision(
        username: String,
        metadataFile: MultipartFile,
        sequenceFile: MultipartFile,
        organism: Organism,
    ): List<SubmissionIdMapping> {
        val revisedData = processRevisedData(metadataFile, sequenceFile)

        return databaseService.reviseData(username, revisedData, organism)
    }

    // TODO(#604): adapt revisions to the new flow
    private fun processRevisedData(
        metadataFile: MultipartFile,
        sequenceFile: MultipartFile,
    ): List<RevisedData> {
        if (metadataFile.originalFilename == null || !metadataFile.originalFilename?.endsWith(".tsv")!!) {
            throw BadRequestException("Metadata file must have extension .tsv")
        }

        val metadataMap = createMetadataMap(metadataFile.inputStream)
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
        metadataMap: Map<SubmissionId, Any>,
        sequenceMap: Map<SubmissionId, Any>,
    ) {
        val metadataKeysSet = metadataMap.keys.toSet()
        val sequenceKeysSet = sequenceMap.keys.toSet()
        validateSubmissionIdSets(metadataKeysSet, sequenceKeysSet)
    }

    private fun validateSubmissionIdSets(metadataKeysSet: Set<SubmissionId>, sequenceKeysSet: Set<SubmissionId>) {
        val metadataKeysNotInSequences = metadataKeysSet.subtract(sequenceKeysSet)
        if (metadataKeysNotInSequences.isNotEmpty()) {
            throw UnprocessableEntityException(
                "Metadata file contains ${metadataKeysNotInSequences.size} submissionIds that are not present " +
                    "in the sequence file: " + metadataKeysNotInSequences.toList().joinToString(limit = 10),
            )
        }

        val sequenceKeysNotInMetadata = sequenceKeysSet.subtract(metadataKeysSet)
        if (sequenceKeysNotInMetadata.isNotEmpty()) {
            throw UnprocessableEntityException(
                "Sequence file contains ${sequenceKeysNotInMetadata.size} submissionIds that are not present " +
                    "in the metadata file: " + sequenceKeysNotInMetadata.toList().joinToString(limit = 10),
            )
        }
    }

    private fun createMetadataMap(metadataInputStream: InputStream): MetadataMap {
        val csvParser =
            CSVParser(
                InputStreamReader(metadataInputStream),
                CSVFormat.TDF.builder().setHeader().setSkipHeaderRecord(true).build(),
            )

        if (!csvParser.headerNames.contains(HEADER_TO_CONNECT_METADATA_AND_SEQUENCES)) {
            throw UnprocessableEntityException(
                "The metadata file does not contain the header '$HEADER_TO_CONNECT_METADATA_AND_SEQUENCES'",
            )
        }

        val metadataList = csvParser.map { it.toMap() }

        val metadataMap =
            metadataList.associate {
                if (it[HEADER_TO_CONNECT_METADATA_AND_SEQUENCES].isNullOrEmpty()) {
                    throw UnprocessableEntityException(
                        "A row in metadata file contains no $HEADER_TO_CONNECT_METADATA_AND_SEQUENCES: $it",
                    )
                }
                it[HEADER_TO_CONNECT_METADATA_AND_SEQUENCES]!! to
                    it.filterKeys { column ->
                        column != HEADER_TO_CONNECT_METADATA_AND_SEQUENCES
                    }
            }

        if (metadataMap.size != metadataList.size) {
            val duplicateKeys =
                metadataList.map { it[HEADER_TO_CONNECT_METADATA_AND_SEQUENCES] }
                    .groupingBy { it }
                    .eachCount()
                    .filter { it.value > 1 }
                    .keys
                    .sortedBy { it }
                .joinToString(limit = 10)

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
            val (submissionId, segmentName) = parseFastaHeader.parse(it.sampleName)
            val segmentMap = sequenceMap.getOrPut(submissionId) { mutableMapOf() }
            if (segmentMap.containsKey(segmentName)) {
                throw UnprocessableEntityException("Sequence file contains duplicate submissionIds: ${it.sampleName}")
            }
            segmentMap[segmentName] = it.sequence
        }
        return sequenceMap
    }
}
