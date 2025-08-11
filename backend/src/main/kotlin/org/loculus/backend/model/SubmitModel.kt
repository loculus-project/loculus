package org.loculus.backend.model

import mu.KotlinLogging
import org.apache.commons.compress.archivers.zip.ZipFile
import org.apache.commons.compress.compressors.CompressorStreamFactory
import org.jetbrains.exposed.exceptions.ExposedSQLException
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
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
import org.loculus.backend.service.datauseterms.DataUseTermsPreconditionValidator
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.files.S3Service
import org.loculus.backend.service.groupmanagement.GroupManagementPreconditionValidator
import org.loculus.backend.service.submission.CompressionAlgorithm
import org.loculus.backend.service.submission.MetadataUploadAuxTable
import org.loculus.backend.service.submission.SequenceUploadAuxTable
import org.loculus.backend.service.submission.SequenceUploadAuxTable.metadataSubmissionIdColumn
import org.loculus.backend.service.submission.SubmissionIdFilesMappingPreconditionValidator
import org.loculus.backend.service.submission.UploadDatabaseService
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.FastaReader
import org.loculus.backend.utils.metadataEntryStreamAsSequence
import org.loculus.backend.utils.revisionEntryStreamAsSequence
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.multipart.MultipartFile
import java.io.BufferedInputStream
import java.io.File
import java.io.InputStream

const val HEADER_TO_CONNECT_METADATA_AND_SEQUENCES = "id"
const val HEADER_TO_CONNECT_METADATA_AND_SEQUENCES_ALTERNATE_FOR_BACKCOMPAT = "submissionId"

const val ACCESSION_HEADER = "accession"
private val log = KotlinLogging.logger { }

typealias SubmissionId = String
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
    private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
    private val dataUseTermsPreconditionValidator: DataUseTermsPreconditionValidator,
    private val submissionIdFilesMappingPreconditionValidator: SubmissionIdFilesMappingPreconditionValidator,
    private val dateProvider: DateProvider,
    private val backendConfig: BackendConfig,
    private val s3Service: S3Service,
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
            val sequenceSubmissionIds = uploadDatabaseService.getSequenceUploadSubmissionIds(uploadId).toSet()
            mapMetadataKeysToSequenceKeys(metadataSubmissionIds, sequenceSubmissionIds, submissionParams.organism)
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
            validateFileExistenceAndGroupOwnership(submittedFiles, submissionParams, uploadId)
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
        if (submissionParams is SubmissionParams.OriginalSubmissionParams) {
            groupManagementPreconditionValidator.validateUserIsAllowedToModifyGroup(
                submissionParams.groupId,
                submissionParams.authenticatedUser,
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

        val sequenceFile = submissionParams.sequenceFile
        if (sequenceFile == null) {
            if (requiresConsensusSequenceFile(submissionParams.organism)) {
                throw BadRequestException(
                    "Submissions for organism ${submissionParams.organism.name} require a sequence file.",
                )
            }
        } else {
            if (!requiresConsensusSequenceFile(submissionParams.organism)) {
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
        try {
            when (submissionParams) {
                is SubmissionParams.OriginalSubmissionParams -> {
                    metadataEntryStreamAsSequence(metadataStream)
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
                    revisionEntryStreamAsSequence(metadataStream)
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

    private fun SubmissionId.removeSuffixPattern(): SubmissionId {
        val lastDelimiter = this.lastIndexOf("_")
        if (lastDelimiter == -1) {
            return this
        }
        val cleaned = this.substring(0, lastDelimiter)
        return cleaned
    }

    @Transactional
    private fun mapMetadataKeysToSequenceKeys(
        metadataKeysSet: Set<SubmissionId>,
        sequenceKeysSet: Set<SubmissionId>,
        organism: Organism,
    ) {
        val metadataKeyToSequences = mutableMapOf<SubmissionId, MutableList<SubmissionId>>()
        val unmatchedSequenceKeys = mutableSetOf<SubmissionId>()
        val ambiguousSequenceKeys = mutableMapOf<SubmissionId, List<SubmissionId>>()

        val referenceGenome = backendConfig.getInstanceConfig(organism).referenceGenome

        for (seqKey in sequenceKeysSet) {
            val matchedMetadataKey = if (referenceGenome.nucleotideSequences.size == 1) {
                val seqKeyInMeta = metadataKeysSet.contains(seqKey)
                when {
                    seqKeyInMeta -> seqKey
                    else -> null
                }
            } else {
                val baseKey = seqKey.removeSuffixPattern()
                val seqKeyInMeta = metadataKeysSet.contains(seqKey)
                val baseKeyInMeta = metadataKeysSet.contains(baseKey)
                if ((seqKey != baseKey) && seqKeyInMeta && baseKeyInMeta) {
                    ambiguousSequenceKeys[seqKey] = listOf(seqKey, baseKey)
                }
                when {
                    seqKeyInMeta -> seqKey
                    baseKeyInMeta -> baseKey
                    else -> null
                }
            }

            if (matchedMetadataKey != null) {
                metadataKeyToSequences.computeIfAbsent(matchedMetadataKey) { mutableListOf() }.add(seqKey)
            } else {
                unmatchedSequenceKeys.add(seqKey)
            }
        }

        val metadataKeysWithoutSequences = metadataKeysSet.filterNot { metadataKeyToSequences.containsKey(it) }

        if (unmatchedSequenceKeys.isNotEmpty() || metadataKeysWithoutSequences.isNotEmpty() ||
            ambiguousSequenceKeys.isNotEmpty()
        ) {
            val unmatchedSeqText = if (unmatchedSequenceKeys.isNotEmpty()) {
                "Sequence file contains ${unmatchedSequenceKeys.size} ids that are not present in the metadata file: ${
                    unmatchedSequenceKeys.joinToString(limit = 10)
                }; "
            } else {
                ""
            }
            val unmatchedMetadataText = if (metadataKeysWithoutSequences.isNotEmpty()) {
                "Metadata file contains ${metadataKeysWithoutSequences.size} ids that are not present in " +
                    "the sequence file: ${metadataKeysWithoutSequences.joinToString(limit = 10)};"
            } else {
                ""
            }
            val ambiguousSequenceText = if (ambiguousSequenceKeys.isNotEmpty()) {
                "Sequence file contains ${ambiguousSequenceKeys.size} ids that could be matched to multiple metadata " +
                    "keys, e.g. ${
                        ambiguousSequenceKeys.entries.joinToString(limit = 3) { (key, value) ->
                            "Sequence key: $key matches $value"
                        }
                    } " +
                    "- to avoid future issues we recommend not using the separator `_` in your metadata submissionIds;"
            } else {
                ""
            }
            throw UnprocessableEntityException(unmatchedSeqText + unmatchedMetadataText + ambiguousSequenceText)
        }

        transaction {
            for ((metadataSubmissionId, sequenceSubmissionIds) in metadataKeyToSequences) {
                for (sequenceSubmissionId in sequenceSubmissionIds) {
                    SequenceUploadAuxTable.update(
                        {
                            SequenceUploadAuxTable.sequenceSubmissionIdColumn eq
                                sequenceSubmissionId
                        },
                    ) {
                        it[metadataSubmissionIdColumn] = metadataSubmissionId
                    }
                }
            }
        }
    }

    private fun validateSubmissionIdSetsForFiles(metadataKeysSet: Set<SubmissionId>, filesKeysSet: Set<SubmissionId>) {
        val filesKeysNotInMetadata = filesKeysSet.subtract(metadataKeysSet)
        if (filesKeysNotInMetadata.isNotEmpty()) {
            throw UnprocessableEntityException(
                "File upload contains ${filesKeysNotInMetadata.size} submissionIds that are not present in the " +
                    "metadata file: " + filesKeysNotInMetadata.toList().joinToString(limit = 10),
            )
        }
    }

    private fun validateFileExistenceAndGroupOwnership(
        submittedFiles: SubmissionIdFilesMap,
        submissionParams: SubmissionParams,
        uploadId: String,
    ) {
        val usedFileIds = submittedFiles.getAllFileIds()
        val fileGroups = filesDatabaseService.getGroupIds(usedFileIds)

        log.debug { "Validating that all submitted file IDs exist." }
        val notExistingIds = usedFileIds.subtract(fileGroups.keys)
        if (notExistingIds.isNotEmpty()) {
            throw BadRequestException("The File IDs $notExistingIds do not exist.")
        }

        log.debug {
            "Validating that submitted files belong to the group that their associated submission belongs to."
        }
        if (submissionParams is SubmissionParams.OriginalSubmissionParams) {
            fileGroups.forEach {
                if (it.value != submissionParams.groupId) {
                    throw BadRequestException(
                        "The File ${it.key} does not belong to group ${submissionParams.groupId}.",
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

    @Transactional(readOnly = true)
    fun checkIfStillProcessingSubmittedData(): Boolean {
        val metadataInAuxTable: Boolean =
            MetadataUploadAuxTable.select(MetadataUploadAuxTable.submissionIdColumn).count() > 0
        val sequencesInAuxTable: Boolean =
            SequenceUploadAuxTable.select(SequenceUploadAuxTable.sequenceSubmissionIdColumn).count() > 0
        return metadataInAuxTable || sequencesInAuxTable
    }

    private fun requiresConsensusSequenceFile(organism: Organism) = backendConfig.getInstanceConfig(organism)
        .schema
        .submissionDataTypes
        .consensusSequences
}
