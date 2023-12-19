package org.pathoplexus.backend.model

import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.apache.commons.compress.archivers.zip.ZipFile
import org.apache.commons.compress.compressors.CompressorStreamFactory
import org.jetbrains.exposed.exceptions.ExposedSQLException
import org.pathoplexus.backend.api.Organism
import org.pathoplexus.backend.api.SubmissionIdMapping
import org.pathoplexus.backend.controller.BadRequestException
import org.pathoplexus.backend.controller.DuplicateKeyException
import org.pathoplexus.backend.controller.UnprocessableEntityException
import org.pathoplexus.backend.service.submission.CompressionAlgorithm
import org.pathoplexus.backend.service.submission.DatabaseService
import org.pathoplexus.backend.service.submission.UploadDatabaseService
import org.pathoplexus.backend.service.submission.UploadType
import org.pathoplexus.backend.utils.FastaReader
import org.pathoplexus.backend.utils.ParseFastaHeader
import org.pathoplexus.backend.utils.metadataEntryStreamAsSequence
import org.pathoplexus.backend.utils.revisionEntryStreamAsSequence
import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile
import java.io.BufferedInputStream
import java.io.File
import java.io.InputStream

const val HEADER_TO_CONNECT_METADATA_AND_SEQUENCES = "submissionId"
const val ACCESSION_HEADER = "accession"
private val log = KotlinLogging.logger { }

typealias SubmissionId = String
typealias SegmentName = String

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

    fun processSubmissions(
        uploadId: String,
        metadataFile: MultipartFile,
        sequenceFile: MultipartFile,
        submitter: String,
        organism: Organism,
        uploadType: UploadType,
        batchSize: Int = 1000,
    ): List<SubmissionIdMapping> {
        return try {
            log.info { "Processing submission of type ${uploadType.name} with uploadId $uploadId" }
            uploadData(
                submitter,
                uploadId,
                metadataFile,
                sequenceFile,
                batchSize,
                organism,
                uploadType,
            )

            log.info { "Validating submission with uploadId $uploadId" }
            val (metadataSubmissionIds, sequencesSubmissionIds) = uploadDatabaseService.getUploadSubmissionIds(uploadId)
            validateSubmissionIdSets(metadataSubmissionIds.toSet(), sequencesSubmissionIds.toSet())

            if (uploadType == UploadType.REVISION) {
                log.info { "Associating uploaded sequence data with existing sequence entries with uploadId $uploadId" }
                uploadDatabaseService.associateRevisedDataWithExistingSequenceEntries(uploadId, organism, submitter)
            }

            log.info { "Persisting submission with uploadId $uploadId" }
            uploadDatabaseService.mapAndCopy(uploadId, uploadType)
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
        uploadType: UploadType,
    ) {
        val metadataTempFileToDelete = MaybeFile()
        val metadataStream = getStreamFromFile(
            metadataMultipartFile,
            uploadId,
            metadataFile,
            metadataTempFileToDelete,
        )
        try {
            uploadMetadata(submitter, uploadId, metadataStream, batchSize, organism, uploadType)
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
        uploadType: UploadType,
    ) {
        log.info {
            "intermediate storing uploaded metadata of type ${uploadType.name} from $submitter with UploadId $uploadId"
        }
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)
        try {
            when (uploadType) {
                UploadType.ORIGINAL -> metadataEntryStreamAsSequence(metadataStream)
                    .chunked(batchSize)
                    .forEach { batch ->
                        uploadDatabaseService.batchInsertMetadataInAuxTable(
                            submitter,
                            uploadId,
                            organism,
                            batch,
                            now,
                        )
                    }
                UploadType.REVISION -> revisionEntryStreamAsSequence(
                    metadataStream,
                ).chunked(batchSize).forEach { batch ->
                    uploadDatabaseService.batchInsertRevisedMetadataInAuxTable(
                        submitter,
                        uploadId,
                        organism,
                        batch,
                        now,
                    )
                }
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

    private fun uploadSequences(uploadId: String, sequenceStream: InputStream, batchSize: Int, organism: Organism) {
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
}
