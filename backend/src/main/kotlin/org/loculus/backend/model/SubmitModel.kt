package org.loculus.backend.model

import mu.KotlinLogging
import org.apache.commons.compress.archivers.zip.ZipFile
import org.apache.commons.compress.compressors.CompressorStreamFactory
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.Organism
import org.loculus.backend.api.SubmissionIdFilesMap
import org.loculus.backend.api.SubmissionIdMapping
import org.loculus.backend.api.getAllFileIds
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.FileSizeConfig
import org.loculus.backend.controller.BadRequestException
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.service.datauseterms.DataUseTermsPreconditionValidator
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.groupmanagement.GroupManagementPreconditionValidator
import org.loculus.backend.service.submission.CompressionAlgorithm
import org.loculus.backend.service.submission.SubmissionIdFilesMappingPreconditionValidator
import org.loculus.backend.service.submission.UploadDatabaseService
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.FastaEntry
import org.loculus.backend.utils.FastaReader
import org.loculus.backend.utils.MetadataEntry
import org.loculus.backend.utils.ParseFastaHeader
import org.loculus.backend.utils.formatBytesHuman
import org.loculus.backend.utils.metadataEntryStreamAsSequence
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import java.io.BufferedInputStream
import java.io.Closeable
import java.io.File
import java.io.InputStream
import java.util.UUID

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
    private val fileSizeConfig: FileSizeConfig,
    private val parseFastaHeader: ParseFastaHeader,
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

    fun processSubmissions(uploadId: String, submissionParams: SubmissionParams): List<SubmissionIdMapping> {
        log.info {
            "Processing submission (type: ${submissionParams.uploadType.name}) with uploadId $uploadId"
        }

        submissionIdFilesMappingPreconditionValidator
            .validateFilenamesAreUnique(submissionParams.files)
            .validateCategoriesMatchSchema(submissionParams.files, submissionParams.organism)
            .validateMultipartUploads(submissionParams.files)
            .validateFilesExist(submissionParams.files)

        if (submissionParams is SubmissionParams.OriginalSubmissionParams) {
            groupManagementPreconditionValidator.validateUserIsAllowedToModifyGroup(
                submissionParams.groupId,
                submissionParams.authenticatedUser,
            )
            dataUseTermsPreconditionValidator.checkThatRestrictedUntilIsAllowed(submissionParams.dataUseTerms)
        }

        val metadata = parseMetadataFile(submissionParams)
        val rawSequences = parseSequenceFile(submissionParams)
        val sequences = groupSequencesById(rawSequences, submissionParams.organism)
        val files = submissionParams.files

        if (requiresConsensusSequenceFile(submissionParams.organism)) {
            log.debug { "Validating submission with uploadId $uploadId" }
            validateSubmissionIdSetsForConsensusSequences(metadata.keys, sequences.keys)
        }

        files?.let {
            validateSubmissionIdSetsForFiles(metadata.keys, it.keys)
            validateFileExistenceAndGroupOwnership(it, submissionParams, metadata)
        }

        return when (submissionParams) {
            is SubmissionParams.OriginalSubmissionParams -> {
                uploadDatabaseService.createNewSequenceEntries(
                    metadata,
                    sequences,
                    files,
                    submissionParams,
                )
            }

            is SubmissionParams.RevisionSubmissionParams -> {
                uploadDatabaseService.createRevisionEntries(
                    metadata,
                    sequences,
                    files,
                    submissionParams,
                )
            }

            else -> throw IllegalStateException("Unknown submission type: ${submissionParams.uploadType}")
        }
    }

    private fun parseMetadataFile(submissionParams: SubmissionParams): Map<SubmissionId, MetadataEntry> =

        AutoDeletingTempFile().use { tempFile ->
            val metadataStream = getStreamFromFile(
                submissionParams.metadataFile,
                metadataFileTypes,
                tempFile,
            )

            val metadataEntries = metadataEntryStreamAsSequence(metadataStream).toList()

            val duplicateIds = metadataEntries.groupBy { it.submissionId }
                .filter { it.value.size > 1 }
                .keys
            if (duplicateIds.isNotEmpty()) {
                throw UnprocessableEntityException(
                    "Metadata file contains duplicated submissionIds: " +
                        duplicateIds.joinToString(", ", transform = { "`$it`" }),
                )
            }

            metadataEntries.associateBy { it.submissionId }
        }

    private fun parseSequenceFile(submissionParams: SubmissionParams): Map<String, String> {
        val sequenceFile = submissionParams.sequenceFile
        if (sequenceFile == null) {
            if (requiresConsensusSequenceFile(submissionParams.organism)) {
                throw BadRequestException(
                    "Submissions for organism ${submissionParams.organism.name} require a sequence file.",
                )
            }
            return emptyMap()
        }
        if (!requiresConsensusSequenceFile(submissionParams.organism)) {
            throw BadRequestException(
                "Sequence uploads are not allowed for organism ${submissionParams.organism.name}.",
            )
        }

        return AutoDeletingTempFile().use { tempFile ->
            val sequenceStream = getStreamFromFile(
                sequenceFile,
                sequenceFileTypes,
                tempFile,
            )

            parseSequencesWithSizeLimit(sequenceStream)
        }
    }

    private fun parseSequencesWithSizeLimit(sequenceStream: InputStream): Map<String, String> {
        val sequences = mutableMapOf<String, String>()
        val duplicateHeaders = mutableSetOf<String>()
        var totalSize = 0L

        FastaReader(sequenceStream).asSequence().forEach { fastaEntry ->
            val entrySize = fastaEntry.sampleName.length + fastaEntry.sequence.length
            totalSize += entrySize

            if (totalSize > fileSizeConfig.maxUncompressedSequenceSize) {
                val maxHuman = formatBytesHuman(fileSizeConfig.maxUncompressedSequenceSize)
                throw ResponseStatusException(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "Uncompressed sequence data exceeds maximum allowed size. Max $maxHuman. " +
                        "Consider splitting your submission into smaller batches.",
                )
            }

            if (sequences.containsKey(fastaEntry.sampleName)) {
                duplicateHeaders.add(fastaEntry.sampleName)
            }

            sequences[fastaEntry.sampleName] = fastaEntry.sequence
        }

        if (duplicateHeaders.isNotEmpty()) {
            throw UnprocessableEntityException(
                "Sequence file contains duplicated FASTA ids: " +
                    duplicateHeaders.joinToString(", ") { "`$it`" },
            )
        }

        return sequences
    }

    private fun groupSequencesById(
        sequences: Map<String, String>,
        organism: Organism,
    ): Map<SubmissionId, Map<SegmentName, String>> {
        val sequencesById = mutableMapOf<SubmissionId, MutableMap<SegmentName, String>>()
        sequences.forEach { (header, sequence) ->
            val (submissionId, segmentName) = parseFastaHeader.parse(header, organism)
            val segmentsForId = sequencesById.getOrPut(submissionId) { mutableMapOf() }
            segmentsForId[segmentName] = sequence
        }
        return sequencesById
    }

    private fun getStreamFromFile(file: MultipartFile, dataType: ValidExtension, tempFile: File): InputStream =
        when (getFileType(file, dataType)) {
            CompressionAlgorithm.ZIP -> {
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
                "Metadata file contains ${metadataKeysNotInSequences.size} ids that are not present " +
                    "in the sequence file: " + metadataKeysNotInSequences.toList().joinToString(limit = 10) + "; "
            } else {
                ""
            }
            val sequenceNotPresentErrorText = if (sequenceKeysNotInMetadata.isNotEmpty()) {
                "Sequence file contains ${sequenceKeysNotInMetadata.size} ids that are not present " +
                    "in the metadata file: " + sequenceKeysNotInMetadata.toList().joinToString(limit = 10)
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
                    "metadata file: " + filesKeysNotInMetadata.toList().joinToString(limit = 10),
            )
        }
    }

    private fun validateFileExistenceAndGroupOwnership(
        submittedFiles: SubmissionIdFilesMap,
        submissionParams: SubmissionParams,
        metadata: Map<SubmissionId, MetadataEntry>,
    ) {
        val usedFileIds = submittedFiles.getAllFileIds()
        val fileToGroupId = filesDatabaseService.getGroupIds(usedFileIds)

        log.debug { "Validating that all submitted file IDs exist." }
        val notExistingIds = usedFileIds.subtract(fileToGroupId.keys)
        if (notExistingIds.isNotEmpty()) {
            throw BadRequestException("The File IDs $notExistingIds do not exist.")
        }

        log.debug {
            "Validating that submitted files belong to the group that their associated submission belongs to."
        }
        when (submissionParams) {
            is SubmissionParams.OriginalSubmissionParams -> {
                fileToGroupId.forEach {
                    if (it.value != submissionParams.groupId) {
                        throw BadRequestException(
                            "The File ${it.key} does not belong to group ${submissionParams.groupId}.",
                        )
                    }
                }
            }

            is SubmissionParams.RevisionSubmissionParams -> {
                val submissionIdToGroup = uploadDatabaseService.submissionIdToGroup(metadata)
                submittedFiles.forEach { (submissionId, filesMap) ->
                    val submissionGroup = submissionIdToGroup[submissionId]
                    filesMap.values.flatten().map { it.fileId }.forEach { fileId ->
                        val fileGroup = fileToGroupId[fileId]
                        if (fileGroup != submissionGroup) {
                            throw BadRequestException(
                                "File $fileId does not belong to group $submissionGroup.",
                            )
                        }
                    }
                }
            }
        }
    }

    private fun requiresConsensusSequenceFile(organism: Organism) = backendConfig.getInstanceConfig(organism)
        .schema
        .submissionDataTypes
        .consensusSequences

    private class AutoDeletingTempFile :
        File(
            System.getProperty("java.io.tmpdir"),
            UUID.randomUUID().toString(),
        ),
        Closeable {

        init {
            createNewFile()
        }

        override fun close() {
            if (exists()) {
                delete()
            }
        }
    }
}
