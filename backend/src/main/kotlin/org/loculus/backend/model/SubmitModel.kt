package org.loculus.backend.model

import mu.KotlinLogging
import org.apache.commons.compress.archivers.zip.ZipFile
import org.apache.commons.compress.compressors.CompressorStreamFactory
import org.jetbrains.exposed.exceptions.ExposedSQLException
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.Organism
import org.loculus.backend.api.SubmissionIdFilesMap
import org.loculus.backend.api.SubmissionIdMapping
import org.loculus.backend.api.getAllFileIds
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.controller.BadRequestException
import org.loculus.backend.controller.DuplicateKeyException
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.submission.CompressionAlgorithm
import org.loculus.backend.service.submission.SubmissionIdFilesMappingPreconditionValidator
import org.loculus.backend.service.submission.UploadDatabaseService
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.FastaReader
import org.loculus.backend.utils.metadataEntryStreamAsSequence
import org.loculus.backend.utils.revisionEntryStreamAsSequence
import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile
import java.io.BufferedInputStream
import java.io.File
import java.io.InputStream

const val METADATA_ID_HEADER = "id"
const val METADATA_ID_HEADER_ALTERNATE_FOR_BACKCOMPAT = "submissionId"
const val FASTA_IDS_HEADER = "fastaIds"
const val FASTA_IDS_SEPARATOR = " "

const val ACCESSION_HEADER = "accession"
private val log = KotlinLogging.logger { }

typealias SubmissionId = String
typealias FastaId = String
typealias SegmentName = String

const val UNIQUE_CONSTRAINT_VIOLATION_SQL_STATE = "23505"

interface SubmissionParams {
    val organism: Organism
    val authenticatedUser: AuthenticatedUser
    val metadataFile: MultipartFile
    val sequenceFile: MultipartFile?
    val files: SubmissionIdFilesMap?
    val uploadType: UploadType

    data class OriginalSubmissionParams(
        override val organism: Organism,
        override val authenticatedUser: AuthenticatedUser,
        override val metadataFile: MultipartFile,
        override val sequenceFile: MultipartFile?,
        override val files: SubmissionIdFilesMap?,
        val groupId: Int,
        val dataUseTerms: DataUseTerms,
    ) : SubmissionParams {
        override val uploadType: UploadType = UploadType.ORIGINAL
    }

    data class RevisionSubmissionParams(
        override val organism: Organism,
        override val authenticatedUser: AuthenticatedUser,
        override val metadataFile: MultipartFile,
        override val sequenceFile: MultipartFile?,
        override val files: SubmissionIdFilesMap?,
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
    private val filesDatabaseService: FilesDatabaseService,
    private val submissionIdFilesMappingPreconditionValidator: SubmissionIdFilesMappingPreconditionValidator,
    private val dateProvider: DateProvider,
    private val backendConfig: BackendConfig,
) {

    companion object AcceptedFileTypes {
        val metadataFileTypes = ValidExtension("Metadata file", listOf("tsv"))
        val sequenceFileTypes = ValidExtension("Sequence file", listOf("fa", "fasta", "seq", "fna", "fas"))
    }

    data class ValidExtension(val displayName: String, val validExtensions: List<String>) {
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
    ): List<SubmissionIdMapping> = try {
        log.info {
            "Processing submission (type: ${submissionParams.uploadType.name}) with uploadId $uploadId"
        }

        submissionIdFilesMappingPreconditionValidator
            .validateFilenameCharacters(submissionParams.files)
            .validateFilenamesAreUnique(submissionParams.files)
            .validateCategoriesMatchSchema(submissionParams.files, submissionParams.organism)
            .validateMultipartUploads(submissionParams.files)
            .validateFilesExist(submissionParams.files)

        insertDataIntoAux(
            uploadId,
            submissionParams,
            batchSize,
        )

        val metadataSubmissionIds = uploadDatabaseService.getMetadataUploadSubmissionIds(uploadId).toSet()
        if (requiresConsensusSequenceFile(submissionParams.organism)) {
            log.debug { "Validating submission with uploadId $uploadId" }
            val metadataFastaIds = uploadDatabaseService.getFastaIdsForMetadata(uploadId).flatten()
            val metadataFastaIdsSet = metadataFastaIds.toSet()
            if (metadataFastaIdsSet.size < metadataFastaIds.size) {
                throw UnprocessableEntityException("Metadata file contains duplicate fastaIds.")
            }
            val sequenceFastaIds = uploadDatabaseService.getSequenceUploadSubmissionIds(uploadId).toSet()
            validateSubmissionIdSetsForConsensusSequences(metadataFastaIdsSet, sequenceFastaIds)
        }

        if (submissionParams is SubmissionParams.RevisionSubmissionParams) {
            log.info { "Associating uploaded sequence data with existing sequence entries with uploadId $uploadId" }
            uploadDatabaseService.associateRevisedDataWithExistingSequenceEntries(
                uploadId,
                submissionParams.organism,
                submissionParams.authenticatedUser,
            )
        }

        submissionParams.files?.let { submittedFiles ->
            val fileSubmissionIds = submittedFiles.keys
            validateSubmissionIdSetsForFiles(metadataSubmissionIds, fileSubmissionIds)
            validateFileGroupOwnership(submittedFiles, submissionParams, uploadId)
        }

        if (submissionParams is SubmissionParams.OriginalSubmissionParams) {
            log.info { "Generating new accessions for uploaded sequence data with uploadId $uploadId" }
            uploadDatabaseService.generateNewAccessionsForOriginalUpload(uploadId)
        }

        log.debug { "Persisting submission with uploadId $uploadId" }
        uploadDatabaseService.mapAndCopy(uploadId, submissionParams)
    } finally {
        uploadDatabaseService.deleteUploadData(uploadId)
    }

    /**
     * Inserts the uploaded metadata (and sequence data) into the 'aux' tables in the database.
     */
    private fun insertDataIntoAux(uploadId: String, submissionParams: SubmissionParams, batchSize: Int) {
        val metadataTempFileToDelete = MaybeFile()
        val metadataStream = getStreamFromFile(
            submissionParams.metadataFile,
            uploadId,
            metadataFileTypes,
            metadataTempFileToDelete,
        )
        val requireConsensusSequence = requiresConsensusSequenceFile(submissionParams.organism)
        try {
            uploadMetadata(uploadId, submissionParams, metadataStream, batchSize)
        } finally {
            metadataTempFileToDelete.delete()
        }

        val sequenceFile = submissionParams.sequenceFile
        if (sequenceFile == null) {
            if (requireConsensusSequence) {
                throw BadRequestException(
                    "Submissions for organism ${submissionParams.organism.name} require a sequence file.",
                )
            }
            return
        }
        if (!requireConsensusSequence) {
            throw BadRequestException(
                "Sequence uploads are not allowed for organism ${submissionParams.organism.name}.",
            )
        }

        val sequenceTempFileToDelete = MaybeFile()
        try {
            val sequenceStream = getStreamFromFile(
                sequenceFile,
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
            val zipFile = ZipFile.builder()
                .setFile(tempFile)
                .setUseUnicodeExtraFields(true)
                .get()
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
        val now = dateProvider.getCurrentDateTime()
        val maxSequencesPerEntry = backendConfig.getInstanceConfig(submissionParams.organism)
            .schema
            .submissionDataTypes
            .maxSequencesPerEntry

        try {
            when (submissionParams) {
                is SubmissionParams.OriginalSubmissionParams -> {
                    metadataEntryStreamAsSequence(metadataStream, maxSequencesPerEntry)
                        .chunked(batchSize)
                        .forEach { batch ->
                            uploadDatabaseService.batchInsertMetadataInAuxTable(
                                uploadId = uploadId,
                                authenticatedUser = submissionParams.authenticatedUser,
                                groupId = submissionParams.groupId,
                                submittedOrganism = submissionParams.organism,
                                uploadedMetadataBatch = batch,
                                uploadedAt = now,
                                files = submissionParams.files,
                            )
                        }
                }

                is SubmissionParams.RevisionSubmissionParams -> {
                    revisionEntryStreamAsSequence(metadataStream, maxSequencesPerEntry)
                        .chunked(batchSize)
                        .forEach { batch ->
                            uploadDatabaseService.batchInsertRevisedMetadataInAuxTable(
                                uploadId = uploadId,
                                authenticatedUser = submissionParams.authenticatedUser,
                                submittedOrganism = submissionParams.organism,
                                uploadedRevisedMetadataBatch = batch,
                                uploadedAt = now,
                                files = submissionParams.files,
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

        val allowedCompressionFormats = expectedFileType.getCompressedExtensions()
            .filter { it.key != CompressionAlgorithm.NONE }
            .flatMap { it.value }.joinToString(", .")
        throw BadRequestException(
            "${expectedFileType.displayName} has wrong extension. Must be " +
                ".${expectedFileType.validExtensions.joinToString(", .")} for uncompressed submissions or " +
                ".$allowedCompressionFormats for compressed submissions",
        )
    }

    private fun validateSubmissionIdSetsForConsensusSequences(
        metadataKeysSet: Set<SubmissionId>,
        sequenceKeysSet: Set<SubmissionId>,
    ) {
        val metadataKeysNotInSequences = metadataKeysSet.subtract(sequenceKeysSet)
        val sequenceKeysNotInMetadata = sequenceKeysSet.subtract(metadataKeysSet)

        if (metadataKeysNotInSequences.isNotEmpty() || sequenceKeysNotInMetadata.isNotEmpty()) {
            val metadataNotPresentErrorText = if (metadataKeysNotInSequences.isNotEmpty()) {
                "Metadata file contains ${metadataKeysNotInSequences.size} FASTA ids that are not present " +
                    "in the sequence file: " + metadataKeysNotInSequences.toList().joinToString(limit = 10) {
                        "'$it'"
                    } + ". "
            } else {
                ""
            }
            val sequenceNotPresentErrorText = if (sequenceKeysNotInMetadata.isNotEmpty()) {
                "Sequence file contains ${sequenceKeysNotInMetadata.size} FASTA ids that are not present " +
                    "in the metadata file: " +
                    sequenceKeysNotInMetadata.toList().joinToString(limit = 10) { "'$it'" }
            } else {
                ""
            }
            throw UnprocessableEntityException(metadataNotPresentErrorText + sequenceNotPresentErrorText)
        }
    }

    private fun validateSubmissionIdSetsForFiles(metadataKeysSet: Set<SubmissionId>, filesKeysSet: Set<SubmissionId>) {
        val filesKeysNotInMetadata = filesKeysSet.subtract(metadataKeysSet)
        if (filesKeysNotInMetadata.isNotEmpty()) {
            throw UnprocessableEntityException(
                "File upload contains ${filesKeysNotInMetadata.size} submissionIds that are not present in the " +
                    "metadata file: " + filesKeysNotInMetadata.toList().joinToString(limit = 10) { "'$it'" },
            )
        }
    }

    private fun validateFileGroupOwnership(
        submittedFiles: SubmissionIdFilesMap,
        submissionParams: SubmissionParams,
        uploadId: String,
    ) {
        log.debug {
            "Validating that submitted files belong to the group that their associated submission belongs to."
        }
        val usedFileIds = submittedFiles.getAllFileIds()
        val fileGroups = filesDatabaseService.getGroupIds(usedFileIds)
        if (submissionParams is SubmissionParams.OriginalSubmissionParams) {
            fileGroups.forEach {
                if (it.value != submissionParams.groupId) {
                    throw BadRequestException(
                        "File ${it.key} does not belong to group ${submissionParams.groupId}.",
                    )
                }
            }
        } else if (submissionParams is SubmissionParams.RevisionSubmissionParams) {
            val submissionIdGroups = uploadDatabaseService.getSubmissionIdToGroupMapping(uploadId)
            submittedFiles.forEach {
                val submissionGroup = submissionIdGroups[it.key]
                val associatedFileIds = it.value.values.flatten().map { it.fileId }
                associatedFileIds.forEach { fileId ->
                    val fileGroup = fileGroups[fileId]
                    if (fileGroup != submissionGroup) {
                        throw BadRequestException(
                            "File $fileId does not belong to group $submissionGroup.",
                        )
                    }
                }
            }
        }
    }

    private fun requiresConsensusSequenceFile(organism: Organism): Boolean = backendConfig.getInstanceConfig(organism)
        .schema
        .submissionDataTypes
        .consensusSequences
}
