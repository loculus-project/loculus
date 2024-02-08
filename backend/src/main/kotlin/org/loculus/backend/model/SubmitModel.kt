package org.loculus.backend.model

import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.apache.commons.compress.archivers.zip.ZipFile
import org.apache.commons.compress.compressors.CompressorStreamFactory
import org.jetbrains.exposed.exceptions.ExposedSQLException
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.Organism
import org.loculus.backend.api.SubmissionIdMapping
import org.loculus.backend.controller.BadRequestException
import org.loculus.backend.controller.DuplicateKeyException
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.service.datauseterms.DataUseTermsPreconditionValidator
import org.loculus.backend.service.groupmanagement.GroupManagementPreconditionValidator
import org.loculus.backend.service.submission.CompressionAlgorithm
import org.loculus.backend.service.submission.UploadDatabaseService
import org.loculus.backend.utils.FastaReader
import org.loculus.backend.utils.metadataEntryStreamAsSequence
import org.loculus.backend.utils.revisionEntryStreamAsSequence
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

interface SubmissionParams {
    val organism: Organism
    val username: String
    val metadataFile: MultipartFile
    val sequenceFile: MultipartFile
    val uploadType: UploadType

    data class OriginalSubmissionParams(
        override val organism: Organism,
        override val username: String,
        override val metadataFile: MultipartFile,
        override val sequenceFile: MultipartFile,
        val groupName: String,
        val dataUseTerms: DataUseTerms,
    ) : SubmissionParams {
        override val uploadType: UploadType = UploadType.ORIGINAL
    }

    data class RevisionSubmissionParams(
        override val organism: Organism,
        override val username: String,
        override val metadataFile: MultipartFile,
        override val sequenceFile: MultipartFile,
    ) : SubmissionParams {
        override val uploadType: UploadType = UploadType.REVISION
    }
}
enum class UploadType {
    ORIGINAL,
    REVISION,
}

@Service
class SubmitModel(
    private val uploadDatabaseService: UploadDatabaseService,
    private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
    private val dataUseTermsPreconditionValidator: DataUseTermsPreconditionValidator,
) {

    companion object AcceptedFileTypes {
        val metadataFileTypes = ValidExtension("Metadata file", listOf("tsv"))
        val sequenceFileTypes = ValidExtension("Sequence file", listOf(""))
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
        submissionParams: SubmissionParams,
        batchSize: Int = 1000,
    ): List<SubmissionIdMapping> {
        return try {
            log.info {
                "Processing submission (type: ${submissionParams.uploadType.name})  with uploadId $uploadId"
            }
            uploadData(
                uploadId,
                submissionParams,
                batchSize,
            )

            log.debug { "Validating submission with uploadId $uploadId" }
            val (metadataSubmissionIds, sequencesSubmissionIds) = uploadDatabaseService.getUploadSubmissionIds(uploadId)
            validateSubmissionIdSets(metadataSubmissionIds.toSet(), sequencesSubmissionIds.toSet())

            if (submissionParams is SubmissionParams.RevisionSubmissionParams) {
                log.info { "Associating uploaded sequence data with existing sequence entries with uploadId $uploadId" }
                uploadDatabaseService.associateRevisedDataWithExistingSequenceEntries(
                    uploadId,
                    submissionParams.organism,
                    submissionParams.username,
                )
            }

            log.debug { "Persisting submission with uploadId $uploadId" }
            uploadDatabaseService.mapAndCopy(uploadId, submissionParams)
        } finally {
            uploadDatabaseService.deleteUploadData(uploadId)
        }
    }

    private fun uploadData(uploadId: String, submissionParams: SubmissionParams, batchSize: Int) {
        if (submissionParams is SubmissionParams.OriginalSubmissionParams) {
            groupManagementPreconditionValidator.validateUserInExistingGroupAndReturnUserList(
                submissionParams.groupName,
                submissionParams.username,
            )
            dataUseTermsPreconditionValidator.checkThatRestrictedUntilIsAllowed(submissionParams.dataUseTerms)
        }

        val metadataTempFileToDelete = MaybeFile()
        val metadataStream = getStreamFromFile(
            submissionParams.metadataFile,
            uploadId,
            metadataFileTypes,
            metadataTempFileToDelete,
        )
        try {
            uploadMetadata(uploadId, submissionParams, metadataStream, batchSize)
        } finally {
            metadataTempFileToDelete.delete()
        }

        val sequenceTempFileToDelete = MaybeFile()
        try {
            val sequenceStream = getStreamFromFile(
                submissionParams.sequenceFile,
                uploadId,
                sequenceFileTypes,
                sequenceTempFileToDelete,
            )
            uploadSequences(uploadId, sequenceStream, batchSize, submissionParams.organism)
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
        uploadId: String,
        submissionParams: SubmissionParams,
        metadataStream: InputStream,
        batchSize: Int,
    ) {
        log.debug {
            "intermediate storing uploaded metadata of type ${submissionParams.uploadType.name} " +
                "from $submissionParams.submitter with UploadId $uploadId"
        }
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)
        try {
            when (submissionParams) {
                is SubmissionParams.OriginalSubmissionParams -> {
                    metadataEntryStreamAsSequence(metadataStream)
                        .chunked(batchSize)
                        .forEach { batch ->
                            uploadDatabaseService.batchInsertMetadataInAuxTable(
                                uploadId,
                                submissionParams.username,
                                submissionParams.groupName,
                                submissionParams.organism,
                                batch,
                                now,
                            )
                        }
                }
                is SubmissionParams.RevisionSubmissionParams -> {
                    revisionEntryStreamAsSequence(metadataStream)
                        .chunked(batchSize)
                        .forEach { batch ->
                            uploadDatabaseService.batchInsertRevisedMetadataInAuxTable(
                                uploadId,
                                submissionParams.username,
                                submissionParams.organism,
                                batch,
                                now,
                            )
                        }
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
                ".${expectedFileType.validExtensions.joinToString(", .")} for uncompressed submissions or " +
                ".${expectedFileType.getCompressedExtensions().filter { it.key != CompressionAlgorithm.NONE }
                    .flatMap { it.value }.joinToString(", .")} for compressed submissions",
        )
    }

    private fun validateSubmissionIdSets(metadataKeysSet: Set<SubmissionId>, sequenceKeysSet: Set<SubmissionId>) {
        val metadataKeysNotInSequences = metadataKeysSet.subtract(sequenceKeysSet)
        val sequenceKeysNotInMetadata = sequenceKeysSet.subtract(metadataKeysSet)

        if (metadataKeysNotInSequences.isNotEmpty() || sequenceKeysNotInMetadata.isNotEmpty()) {
            val metadataNotPresentErrorText = if (metadataKeysNotInSequences.isNotEmpty()) {
                "Metadata file contains ${metadataKeysNotInSequences.size} submissionIds that are not present " +
                    "in the sequence file: " + metadataKeysNotInSequences.toList().joinToString(limit = 10) + "; "
            } else {
                ""
            }
            val sequenceNotPresentErrorText = if (sequenceKeysNotInMetadata.isNotEmpty()) {
                "Sequence file contains ${sequenceKeysNotInMetadata.size} submissionIds that are not present " +
                    "in the metadata file: " + sequenceKeysNotInMetadata.toList().joinToString(limit = 10)
            } else {
                ""
            }
            throw UnprocessableEntityException(metadataNotPresentErrorText + sequenceNotPresentErrorText)
        }
    }
}
