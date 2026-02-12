package org.loculus.backend.service.submission

import com.fasterxml.jackson.core.JacksonException
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.sql.Count
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.LongColumnType
import org.jetbrains.exposed.sql.Op
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.less
import org.jetbrains.exposed.sql.SqlExpressionBuilder.plus
import org.jetbrains.exposed.sql.Transaction
import org.jetbrains.exposed.sql.VarCharColumnType
import org.jetbrains.exposed.sql.alias
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.booleanParam
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.json.extract
import org.jetbrains.exposed.sql.kotlin.datetime.dateTimeParam
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.not
import org.jetbrains.exposed.sql.notExists
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.statements.StatementType
import org.jetbrains.exposed.sql.stringLiteral
import org.jetbrains.exposed.sql.stringParam
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.jetbrains.exposed.sql.vendors.ForUpdateOption.PostgreSQL.ForUpdate
import org.jetbrains.exposed.sql.vendors.ForUpdateOption.PostgreSQL.MODE
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.AccessionVersionOriginalMetadata
import org.loculus.backend.api.ApproveDataScope
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsType
import org.loculus.backend.api.DeleteSequenceScope
import org.loculus.backend.api.EditedSequenceEntryData
import org.loculus.backend.api.ExternalSubmittedData
import org.loculus.backend.api.FileCategory
import org.loculus.backend.api.FileIdAndMaybeReleasedAt
import org.loculus.backend.api.FileIdAndNameAndReadUrl
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.GetSequenceResponse
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalDataWithFileUrls
import org.loculus.backend.api.PreprocessingStatus.IN_PROCESSING
import org.loculus.backend.api.PreprocessingStatus.PROCESSED
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.ProcessingResult
import org.loculus.backend.api.ProcessingResult.HAS_ERRORS
import org.loculus.backend.api.ProcessingResult.HAS_WARNINGS
import org.loculus.backend.api.ProcessingResult.NO_ISSUES
import org.loculus.backend.api.SequenceEntryStatus
import org.loculus.backend.api.SequenceEntryVersionToEdit
import org.loculus.backend.api.Status
import org.loculus.backend.api.Status.APPROVED_FOR_RELEASE
import org.loculus.backend.api.SubmissionIdMapping
import org.loculus.backend.api.SubmittedProcessedData
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.api.fileIds
import org.loculus.backend.api.getFileId
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.BadRequestException
import org.loculus.backend.controller.ProcessingValidationException
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.service.datauseterms.DataUseTermsTable
import org.loculus.backend.service.files.FileId
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.files.S3Service
import org.loculus.backend.service.groupmanagement.GroupEntity
import org.loculus.backend.service.groupmanagement.GroupManagementDatabaseService
import org.loculus.backend.service.groupmanagement.GroupManagementPreconditionValidator
import org.loculus.backend.service.submission.SequenceEntriesTable.accessionColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.groupIdColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.versionColumn
import org.loculus.backend.service.submission.dbtables.CurrentProcessingPipelineTable
import org.loculus.backend.service.submission.dbtables.ExternalMetadataTable
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.Version
import org.loculus.backend.utils.toTimestamp
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.util.Locale
import kotlin.time.Instant

private val log = KotlinLogging.logger { }

@Service
@Transactional
class SubmissionDatabaseService(
    private val processedSequenceEntryValidatorFactory: ProcessedSequenceEntryValidatorFactory,
    private val externalMetadataValidatorFactory: ExternalMetadataValidatorFactory,
    private val accessionPreconditionValidator: AccessionPreconditionValidator,
    private val fileMappingPreconditionValidator: FileMappingPreconditionValidator,
    private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
    private val groupManagementDatabaseService: GroupManagementDatabaseService,
    private val s3Service: S3Service,
    private val filesDatabaseService: FilesDatabaseService,
    private val objectMapper: ObjectMapper,
    private val emptyProcessedDataProvider: EmptyProcessedDataProvider,
    private val compressionService: CompressionService,
    private val processedDataPostprocessor: ProcessedDataPostprocessor,
    private val auditLogger: AuditLogger,
    private val dateProvider: DateProvider,
    @Value("\${${BackendSpringProperty.STREAM_BATCH_SIZE}}") private val streamBatchSize: Int,
) {
    private var lastPreprocessedDataUpdate: String? = null

    fun streamUnprocessedSubmissions(
        numberOfSequenceEntries: Int,
        organism: Organism,
        pipelineVersion: Long,
    ): Sequence<UnprocessedData> {
        log.info { "Request received to stream up to $numberOfSequenceEntries unprocessed submissions for $organism." }

        return fetchUnprocessedEntriesAndUpdateToInProcessing(
            organism,
            numberOfSequenceEntries,
            pipelineVersion,
        )
    }

    fun getCurrentProcessingPipelineVersion(organism: Organism): Long {
        val table = CurrentProcessingPipelineTable
        return table
            .select(table.versionColumn)
            .where { table.organismColumn eq organism.name }
            .map {
                it[table.versionColumn]
            }
            .first()
    }

    private fun fetchUnprocessedEntriesAndUpdateToInProcessing(
        organism: Organism,
        numberOfSequenceEntries: Int,
        pipelineVersion: Long,
    ): Sequence<UnprocessedData> {
        val table = SequenceEntriesTable
        val preprocessing = SequenceEntriesPreprocessedDataTable

        return table
            .select(
                table.accessionColumn,
                table.versionColumn,
                table.originalDataColumn,
                table.submissionIdColumn,
                table.submitterColumn,
                table.groupIdColumn,
                table.submittedAtTimestampColumn,
            )
            .where {
                table.organismIs(organism) and
                    not(table.isRevocationColumn) and
                    notExists(
                        preprocessing.selectAll().where {
                            (table.accessionColumn eq preprocessing.accessionColumn) and
                                (table.versionColumn eq preprocessing.versionColumn) and
                                (preprocessing.pipelineVersionColumn eq pipelineVersion)
                        },
                    )
            }
            .orderBy(table.accessionColumn)
            .limit(numberOfSequenceEntries)
            .forUpdate(ForUpdate(mode = MODE.SKIP_LOCKED))
            .fetchSize(streamBatchSize)
            .asSequence()
            .chunked(streamBatchSize)
            .map { chunk ->
                val chunkOfUnprocessedData = chunk.map {
                    val originalData = compressionService.decompressSequencesInOriginalData(
                        it[table.originalDataColumn]!!,
                    )
                    val originalDataWithFileUrls = OriginalDataWithFileUrls(
                        originalData.metadata,
                        originalData.unalignedNucleotideSequences,
                        originalData.files?.let {
                            it.mapValues {
                                it.value.map { f ->
                                    val presignedUrl = s3Service.createUrlToReadPrivateFile(f.fileId)
                                    FileIdAndNameAndReadUrl(f.fileId, f.name, presignedUrl)
                                }
                            }
                        },
                    )
                    UnprocessedData(
                        accession = it[table.accessionColumn],
                        version = it[table.versionColumn],
                        data = originalDataWithFileUrls,
                        submissionId = it[table.submissionIdColumn],
                        submitter = it[table.submitterColumn],
                        groupId = it[table.groupIdColumn],
                        submittedAt = it[table.submittedAtTimestampColumn].toTimestamp(),
                    )
                }
                updateStatusToProcessing(chunkOfUnprocessedData, pipelineVersion)
            }
            .flatten()
    }

    private fun updateStatusToProcessing(
        sequenceEntries: List<UnprocessedData>,
        pipelineVersion: Long,
    ): List<UnprocessedData> {
        log.info { "updating status to processing. Number of sequence entries: ${sequenceEntries.size}" }

        val table = SequenceEntriesPreprocessedDataTable
        val now = dateProvider.getCurrentDateTime()

        table.batchInsert(sequenceEntries, ignore = true, shouldReturnGeneratedValues = false) {
            this[table.accessionColumn] = it.accession
            this[table.versionColumn] = it.version
            this[table.pipelineVersionColumn] = pipelineVersion
            this[table.processingStatusColumn] = IN_PROCESSING.name
            this[table.startedProcessingAtColumn] = now
        }

        // Query back to reliably determine which entries were actually claimed by this pipeline.
        // We match on the exact startedProcessingAt timestamp to distinguish our inserts
        // from entries claimed by concurrent pipelines.
        val claimedKeys = table
            .select(table.accessionColumn, table.versionColumn)
            .where {
                (table.pipelineVersionColumn eq pipelineVersion) and
                    (table.startedProcessingAtColumn eq now) and
                    (table.accessionColumn to table.versionColumn).inList(
                        sequenceEntries.map { it.accession to it.version },
                    )
            }
            .map { Pair(it[table.accessionColumn], it[table.versionColumn]) }
            .toSet()

        if (claimedKeys.size < sequenceEntries.size) {
            val skippedCount = sequenceEntries.size - claimedKeys.size
            log.warn {
                "$skippedCount entries were already claimed by another pipeline and will be skipped."
            }
        }

        return sequenceEntries.filter { Pair(it.accession, it.version) in claimedKeys }
    }

    fun updateProcessedData(inputStream: InputStream, organism: Organism, pipelineVersion: Long) {
        log.info { "updating processed data" }
        val reader = BufferedReader(InputStreamReader(inputStream))

        val processedAccessionVersions = mutableListOf<String>()
        val processedFiles = mutableMapOf<AccessionVersion, Set<FileId>>()
        val processingResultCounts = mutableMapOf<ProcessingResult, Int>()
        reader.lineSequence().forEach { line ->
            val submittedProcessedData = try {
                objectMapper.readValue<SubmittedProcessedData>(line)
            } catch (e: JacksonException) {
                throw BadRequestException("Failed to deserialize NDJSON line: ${e.message}", e)
            }
            submittedProcessedData.data.files?.let { fileMapping ->
                fileMappingPreconditionValidator
                    .validateFilenameCharacters(fileMapping)
                    .validateFilenamesAreUnique(fileMapping)
                    .validateCategoriesMatchOutputSchema(fileMapping, organism)
                    .validateMultipartUploads(fileMapping.fileIds)
                    .validateFilesExist(fileMapping.fileIds)
                val accessionVersion =
                    AccessionVersion(submittedProcessedData.accession, submittedProcessedData.version)
                processedFiles[accessionVersion] = fileMapping.fileIds
            }

            val processingResult = submittedProcessedData.processingResult()

            insertProcessedData(submittedProcessedData, organism, pipelineVersion)
            processedAccessionVersions.add(submittedProcessedData.displayAccessionVersion())
            processingResultCounts.merge(processingResult, 1, Int::plus)
        }

        if (processedFiles.isNotEmpty()) {
            val releasedEntries = getReleasedAt(processedFiles.keys.toList())
                .filter { it.value != null }
                .keys
            val releasedFiles = mutableSetOf<FileId>()
            for (entry in releasedEntries) {
                for (fileId in processedFiles[entry]!!) {
                    s3Service.setFileToPublic(fileId)
                    releasedFiles.add(fileId)
                }
            }
        }

        log.info {
            "Updated ${processedAccessionVersions.size} sequences to $PROCESSED. " +
                "Processing result counts: " +
                processingResultCounts.entries.joinToString { "${it.key}=${it.value}" }
        }

        auditLogger.log(
            username = "<pipeline version $pipelineVersion>",
            description = "Processed ${processedAccessionVersions.size} sequences: " +
                processedAccessionVersions.joinToString() +
                "Processing result counts: " +
                processingResultCounts.entries.joinToString { "${it.key}=${it.value}" },
        )
    }

    fun updateExternalMetadata(inputStream: InputStream, organism: Organism, externalMetadataUpdater: String) {
        log.info { "Updating metadata with external metadata received from $externalMetadataUpdater" }
        val reader = BufferedReader(InputStreamReader(inputStream))

        val accessionVersions = mutableListOf<String>()
        reader.lineSequence().forEach { line ->
            val submittedExternalMetadata =
                try {
                    objectMapper.readValue<ExternalSubmittedData>(line)
                } catch (e: JacksonException) {
                    throw BadRequestException(
                        "Failed to deserialize NDJSON line: ${e.message}",
                        e,
                    )
                }
            accessionVersions.add(submittedExternalMetadata.displayAccessionVersion())

            insertExternalMetadata(
                submittedExternalMetadata,
                organism,
                externalMetadataUpdater,
            )
        }

        auditLogger.log(
            description = (
                "Updated external metadata of ${accessionVersions.size} sequences:" +
                    accessionVersions.joinToString()
                ),
            username = externalMetadataUpdater,
        )
    }

    private fun insertExternalMetadata(
        submittedExternalMetadata: ExternalSubmittedData,
        organism: Organism,
        externalMetadataUpdater: String,
    ) {
        accessionPreconditionValidator.validate {
            thatAccessionVersionExists(submittedExternalMetadata)
                .andThatSequenceEntriesAreInStates(
                    listOf(Status.APPROVED_FOR_RELEASE),
                )
                .andThatOrganismIs(organism)
        }
        validateExternalMetadata(
            submittedExternalMetadata,
            organism,
            externalMetadataUpdater,
        )

        val numberInserted =
            ExternalMetadataTable.update(
                where = {
                    (ExternalMetadataTable.accessionColumn eq submittedExternalMetadata.accession) and
                        (ExternalMetadataTable.versionColumn eq submittedExternalMetadata.version) and
                        (ExternalMetadataTable.updaterIdColumn eq externalMetadataUpdater)
                },
            ) {
                it[accessionColumn] = submittedExternalMetadata.accession
                it[versionColumn] = submittedExternalMetadata.version
                it[updaterIdColumn] = externalMetadataUpdater
                it[externalMetadataColumn] = submittedExternalMetadata.externalMetadata
                it[updatedAtColumn] = dateProvider.getCurrentDateTime()
            }

        if (numberInserted != 1) {
            ExternalMetadataTable.insert {
                it[accessionColumn] = submittedExternalMetadata.accession
                it[versionColumn] = submittedExternalMetadata.version
                it[updaterIdColumn] = externalMetadataUpdater
                it[externalMetadataColumn] = submittedExternalMetadata.externalMetadata
                it[updatedAtColumn] = dateProvider.getCurrentDateTime()
            }
        }
    }

    private fun insertProcessedData(
        submittedProcessedData: SubmittedProcessedData,
        organism: Organism,
        pipelineVersion: Long,
    ) {
        val submittedErrors = submittedProcessedData.errors.orEmpty()
        val submittedWarnings = submittedProcessedData.warnings.orEmpty()
        val processedData = when {
            submittedErrors.isEmpty() -> postprocessAndValidateProcessedData(submittedProcessedData, organism)
            else -> submittedProcessedData.data // No need to validate if there are errors, can't be released anyway
        }

        val table = SequenceEntriesPreprocessedDataTable
        val numberInserted =
            table.update(
                where = {
                    table.accessionVersionEquals(submittedProcessedData) and
                        table.statusIs(IN_PROCESSING) and
                        (table.pipelineVersionColumn eq pipelineVersion)
                },
            ) {
                it[processingStatusColumn] = PROCESSED.name
                it[processedDataColumn] =
                    processedDataPostprocessor.prepareForStorage(processedData, organism)
                it[errorsColumn] = submittedErrors
                it[warningsColumn] = submittedWarnings
                it[finishedProcessingAtColumn] = dateProvider.getCurrentDateTime()
            }

        if (numberInserted != 1) {
            throwInsertFailedException(submittedProcessedData, pipelineVersion)
        }
    }

    /**
     * Returns all files associated with the given AccessionVersions.
     * Note: Also returns files from 'future' preprocessing versions!
     */
    private fun selectFilesToPublishForAccessionVersions(sequences: List<AccessionVersion>): List<FileId> {
        val preproData = SequenceEntriesPreprocessedDataTable
        val sequenceEntries = SequenceEntriesView
        val result = mutableListOf<FileId>()
        for (accessionVersionsChunk in sequences.chunked(1000)) {
            preproData
                .join(
                    sequenceEntries,
                    JoinType.INNER,
                    additionalConstraint = {
                        (preproData.accessionColumn eq sequenceEntries.accessionColumn) and
                            (preproData.versionColumn eq sequenceEntries.versionColumn) and
                            (preproData.pipelineVersionColumn greaterEq sequenceEntries.pipelineVersionColumn)
                    },
                )
                .select(preproData.processedDataColumn)
                .where {
                    sequenceEntries.accessionVersionIsIn(accessionVersionsChunk)
                }
                .flatMap {
                    it[preproData.processedDataColumn]?.files?.values.orEmpty()
                }
                .flatten()
                .forEach { result.add(it.fileId) }
        }
        return result
    }

    private fun postprocessAndValidateProcessedData(
        submittedProcessedData: SubmittedProcessedData,
        organism: Organism,
    ) = try {
        throwIfIsSubmissionForWrongOrganism(submittedProcessedData, organism)
        validateFilesBelongToSubmittingGroup(submittedProcessedData)
        val processedData = makeSequencesUpperCase(submittedProcessedData.data)
        processedSequenceEntryValidatorFactory.create(organism).validate(processedData)
    } catch (validationException: ProcessingValidationException) {
        throw validationException
    }

    private fun makeSequencesUpperCase(processedData: ProcessedData<GeneticSequence>) = processedData.copy(
        unalignedNucleotideSequences = processedData.unalignedNucleotideSequences.mapValues { (_, it) ->
            it?.uppercase(Locale.US)
        },
        alignedNucleotideSequences = processedData.alignedNucleotideSequences.mapValues { (_, it) ->
            it?.uppercase(Locale.US)
        },
        alignedAminoAcidSequences = processedData.alignedAminoAcidSequences.mapValues { (_, it) ->
            it?.uppercase(Locale.US)
        },
        nucleotideInsertions = processedData.nucleotideInsertions.mapValues { (_, it) ->
            it.map { insertion -> insertion.copy(sequence = insertion.sequence.uppercase(Locale.US)) }
        },
        aminoAcidInsertions = processedData.aminoAcidInsertions.mapValues { (_, it) ->
            it.map { insertion -> insertion.copy(sequence = insertion.sequence.uppercase(Locale.US)) }
        },
        sequenceNameToFastaId = processedData.sequenceNameToFastaId,
    )

    private fun validateExternalMetadata(
        externalSubmittedData: ExternalSubmittedData,
        organism: Organism,
        externalMetadataUpdater: String,
    ) = externalMetadataValidatorFactory
        .create(organism)
        .validate(externalSubmittedData.externalMetadata, externalMetadataUpdater)

    private fun throwIfIsSubmissionForWrongOrganism(
        submittedProcessedData: SubmittedProcessedData,
        organism: Organism,
    ) {
        val resultRow = SequenceEntriesView
            .select(SequenceEntriesView.organismColumn)
            .where { SequenceEntriesView.accessionVersionEquals(submittedProcessedData) }
            .firstOrNull() ?: return

        if (resultRow[SequenceEntriesView.organismColumn] != organism.name) {
            throw UnprocessableEntityException(
                "Accession version ${submittedProcessedData.displayAccessionVersion()} is for organism " +
                    "${resultRow[SequenceEntriesView.organismColumn]}, " +
                    "but submitted data is for organism ${organism.name}",
            )
        }
    }

    private fun throwInsertFailedException(submittedProcessedData: SubmittedProcessedData, pipelineVersion: Long) {
        val preprocessing = SequenceEntriesPreprocessedDataTable
        val selectedSequenceEntries = preprocessing
            .select(
                preprocessing.accessionColumn,
                preprocessing.versionColumn,
                preprocessing.processingStatusColumn,
                preprocessing.pipelineVersionColumn,
            )
            .where { preprocessing.accessionVersionEquals(submittedProcessedData) }

        val accessionVersion = submittedProcessedData.displayAccessionVersion()
        if (selectedSequenceEntries.all {
                it[preprocessing.processingStatusColumn] != IN_PROCESSING.name
            }
        ) {
            throw UnprocessableEntityException(
                "Accession version $accessionVersion does not exist or is not awaiting any processing results",
            )
        }
        if (selectedSequenceEntries.all { it[preprocessing.pipelineVersionColumn] != pipelineVersion }) {
            throw UnprocessableEntityException(
                "Accession version $accessionVersion is not awaiting processing results of version " +
                    "$pipelineVersion (anymore)",
            )
        }
        throw IllegalStateException(
            "Update processed data: Unexpected error for accession versions $accessionVersion",
        )
    }

    private fun validateFilesBelongToSubmittingGroup(submittedProcessedData: SubmittedProcessedData) {
        // TODO(#3951): This implementation is very inefficient as it makes two requests to the database for
        //  each sequence entry.
        if (submittedProcessedData.data.files == null) {
            return
        }
        val sequenceEntryGroup = SequenceEntriesTable
            .select(groupIdColumn)
            .where {
                (accessionColumn eq submittedProcessedData.accession) and
                    (versionColumn eq submittedProcessedData.version)
            }
            .single()[groupIdColumn]
        val fileIds = submittedProcessedData.data.files.flatMap { it.value.map { it.fileId } }.toSet()
        val fileGroups = filesDatabaseService.getGroupIds(fileIds)
        fileGroups.forEach { (fileId, fileGroup) ->
            if (fileGroup != sequenceEntryGroup) {
                throw UnprocessableEntityException(
                    "Accession version ${submittedProcessedData.displayAccessionVersion()} belongs to " +
                        "group $sequenceEntryGroup but the attached file $fileId belongs to the group $fileGroup.",
                )
            }
        }
    }

    private fun getGroupCondition(groupIdsFilter: List<Int>?, authenticatedUser: AuthenticatedUser): Op<Boolean> =
        if (groupIdsFilter != null) {
            groupManagementPreconditionValidator.validateUserIsAllowedToModifyGroups(
                groupIdsFilter,
                authenticatedUser,
            )
            SequenceEntriesView.groupIsOneOf(groupIdsFilter)
        } else if (authenticatedUser.isSuperUser) {
            Op.TRUE
        } else {
            SequenceEntriesView.groupIsOneOf(groupManagementDatabaseService.getGroupIdsOfUser(authenticatedUser))
        }

    fun approveProcessedData(
        authenticatedUser: AuthenticatedUser,
        accessionVersionsFilter: List<AccessionVersion>?,
        submitterNamesFilter: List<String>?,
        groupIdsFilter: List<Int>?,
        organism: Organism,
        scope: ApproveDataScope,
    ): List<AccessionVersion> {
        if (accessionVersionsFilter == null) {
            log.info { "approving all sequences by all groups ${authenticatedUser.username} is member of" }
        } else {
            log.info { "approving ${accessionVersionsFilter.size} sequences by ${authenticatedUser.username}" }
        }

        if (accessionVersionsFilter != null) {
            accessionPreconditionValidator.validate {
                thatAccessionVersionsExist(accessionVersionsFilter)
                    .andThatOrganismIs(organism)
                    .andThatSequenceEntriesAreInStates(listOf(Status.PROCESSED))
                    .andThatSequenceEntriesHaveNoErrors()
                    .andThatUserIsAllowedToEditSequenceEntries(authenticatedUser)
            }
        }

        val statusCondition = SequenceEntriesView.statusIs(Status.PROCESSED)

        val accessionCondition = if (accessionVersionsFilter !== null) {
            SequenceEntriesView.accessionVersionIsIn(accessionVersionsFilter)
        } else if (authenticatedUser.isSuperUser) {
            Op.TRUE
        } else {
            SequenceEntriesView.groupIsOneOf(groupManagementDatabaseService.getGroupIdsOfUser(authenticatedUser))
        }

        val includedProcessingResults = mutableListOf(NO_ISSUES)
        if (scope == ApproveDataScope.ALL) {
            includedProcessingResults.add(HAS_WARNINGS)
        }
        val scopeCondition = SequenceEntriesView.processingResultIsOneOf(includedProcessingResults)

        val groupCondition = getGroupCondition(groupIdsFilter, authenticatedUser)

        val submitterCondition = if (submitterNamesFilter !== null) {
            SequenceEntriesView.submitterIsOneOf(submitterNamesFilter)
        } else {
            Op.TRUE
        }

        val organismCondition = SequenceEntriesView.organismIs(organism)

        val accessionVersionsToUpdate = SequenceEntriesView
            .select(SequenceEntriesView.accessionColumn, SequenceEntriesView.versionColumn)
            .where {
                statusCondition and accessionCondition and scopeCondition and groupCondition and
                    organismCondition and submitterCondition
            }
            .map { AccessionVersion(it[SequenceEntriesView.accessionColumn], it[SequenceEntriesView.versionColumn]) }

        if (accessionVersionsToUpdate.isEmpty()) {
            return emptyList()
        }

        val now = dateProvider.getCurrentDateTime()
        for (accessionVersionsChunk in accessionVersionsToUpdate.chunked(1000)) {
            SequenceEntriesTable.update(
                where = {
                    SequenceEntriesTable.accessionVersionIsIn(accessionVersionsChunk)
                },
            ) {
                it[releasedAtTimestampColumn] = now
                it[approverColumn] = authenticatedUser.username
            }
        }

        val filesToPublish = this.selectFilesToPublishForAccessionVersions(accessionVersionsToUpdate)
        for (fileId in filesToPublish) {
            s3Service.setFileToPublic(fileId)
        }

        auditLogger.log(
            authenticatedUser.username,
            "Approved ${accessionVersionsToUpdate.size} sequences: " +
                accessionVersionsToUpdate.joinToString { it.displayAccessionVersion() },
        )

        return accessionVersionsToUpdate
    }

    private fun durationTillNowInMs(startTime: Instant): Long =
        dateProvider.getCurrentInstant().minus(startTime, DateTimeUnit.MILLISECOND)

    fun getLatestVersions(organism: Organism): Map<Accession, Version> {
        val startTime = dateProvider.getCurrentInstant()
        val maxVersionExpression = SequenceEntriesView.versionColumn.max()
        val result = SequenceEntriesView
            .select(SequenceEntriesView.accessionColumn, maxVersionExpression)
            .where {
                SequenceEntriesView.statusIs(Status.APPROVED_FOR_RELEASE) and SequenceEntriesView.organismIs(
                    organism,
                )
            }
            .groupBy(SequenceEntriesView.accessionColumn)
            .associate { it[SequenceEntriesView.accessionColumn] to it[maxVersionExpression]!! }
        log.info { "Getting latest versions for $organism took ${durationTillNowInMs(startTime)} ms" }
        return result
    }

    fun getLatestRevocationVersions(organism: Organism): Map<Accession, Version> {
        val startTime = dateProvider.getCurrentInstant()
        val maxVersionExpression = SequenceEntriesView.versionColumn.max()

        val result = SequenceEntriesView.select(SequenceEntriesView.accessionColumn, maxVersionExpression)
            .where {
                SequenceEntriesView.statusIs(Status.APPROVED_FOR_RELEASE) and
                    (SequenceEntriesView.isRevocationColumn eq true) and
                    SequenceEntriesView.organismIs(organism)
            }
            .groupBy(SequenceEntriesView.accessionColumn)
            .associate { it[SequenceEntriesView.accessionColumn] to it[maxVersionExpression]!! }
        log.info { "Getting latest revocation versions for $organism took ${durationTillNowInMs(startTime)} ms" }
        return result
    }

    // Make sure to keep in sync with streamReleasedSubmissions query
    fun countReleasedSubmissions(organism: Organism, releasedSince: LocalDateTime? = null): Long {
        val startTime = dateProvider.getCurrentInstant()
        val result = SequenceEntriesView.select(
            SequenceEntriesView.accessionColumn,
        ).where {
            var condition = SequenceEntriesView.statusIs(Status.APPROVED_FOR_RELEASE) and
                SequenceEntriesView.organismIs(organism)
            if (releasedSince != null) {
                condition = condition and (SequenceEntriesView.releasedAtTimestampColumn greater releasedSince)
            }
            condition
        }.count()
        log.info { "Counting released submissions for $organism took ${durationTillNowInMs(startTime)} ms" }
        return result
    }

    // Make sure to keep in sync with countReleasedSubmissions query
    fun streamReleasedSubmissions(organism: Organism, releasedSince: LocalDateTime? = null): Sequence<RawProcessedData> = SequenceEntriesView.join(
        DataUseTermsTable,
        JoinType.LEFT,
        additionalConstraint = {
            (SequenceEntriesView.accessionColumn eq DataUseTermsTable.accessionColumn) and
                (DataUseTermsTable.isNewestDataUseTerms)
        },
    )
        .select(
            SequenceEntriesView.accessionColumn,
            SequenceEntriesView.versionColumn,
            SequenceEntriesView.isRevocationColumn,
            SequenceEntriesView.versionCommentColumn,
            SequenceEntriesView.jointDataColumn,
            SequenceEntriesView.submitterColumn,
            SequenceEntriesView.groupIdColumn,
            SequenceEntriesView.submittedAtTimestampColumn,
            SequenceEntriesView.releasedAtTimestampColumn,
            SequenceEntriesView.submissionIdColumn,
            SequenceEntriesView.pipelineVersionColumn,
            DataUseTermsTable.dataUseTermsTypeColumn,
            DataUseTermsTable.restrictedUntilColumn,
            DataUseTermsTable.changeDateColumn,
        )
        .where {
            var condition = SequenceEntriesView.statusIs(Status.APPROVED_FOR_RELEASE) and
                SequenceEntriesView.organismIs(organism)
            if (releasedSince != null) {
                condition = condition and (SequenceEntriesView.releasedAtTimestampColumn greater releasedSince)
            }
            condition
        }
        .orderBy(
            SequenceEntriesView.accessionColumn to SortOrder.ASC,
            SequenceEntriesView.versionColumn to SortOrder.ASC,
        )
        .fetchSize(streamBatchSize)
        .asSequence()
        .map {
            RawProcessedData(
                accession = it[SequenceEntriesView.accessionColumn],
                version = it[SequenceEntriesView.versionColumn],
                isRevocation = it[SequenceEntriesView.isRevocationColumn],
                submitter = it[SequenceEntriesView.submitterColumn],
                groupId = it[SequenceEntriesView.groupIdColumn],
                groupName = GroupEntity[it[SequenceEntriesView.groupIdColumn]].groupName,
                submissionId = it[SequenceEntriesView.submissionIdColumn],
                processedData = when (val processedData = it[SequenceEntriesView.jointDataColumn]) {
                    null -> emptyProcessedDataProvider.provide(organism)
                    else -> processedDataPostprocessor.retrieveFromStoredValue(processedData, organism)
                },
                pipelineVersion = it[SequenceEntriesView.pipelineVersionColumn]!!,
                submittedAtTimestamp = it[SequenceEntriesView.submittedAtTimestampColumn],
                releasedAtTimestamp = it[SequenceEntriesView.releasedAtTimestampColumn]!!,
                dataUseTerms = DataUseTerms.fromParameters(
                    DataUseTermsType.fromString(it[DataUseTermsTable.dataUseTermsTypeColumn]),
                    it[DataUseTermsTable.restrictedUntilColumn],
                ),
                versionComment = it[SequenceEntriesView.versionCommentColumn],
                dataUseTermsChangeDate = it[DataUseTermsTable.changeDateColumn],
            )
        }

    /**
     * Returns a paginated list of sequences matching the given filters.
     * Also returns status counts and processing result counts.
     * Note that counts are totals: _not_ affected by pagination, status or processing result filter;
     * i.e. the counts are for all sequences from that group and organism.
     * Page and size are 0-indexed!
     */
    fun getSequences(
        authenticatedUser: AuthenticatedUser,
        organism: Organism,
        groupIdsFilter: List<Int>? = null,
        statusesFilter: List<Status>? = null,
        processingResultFilter: List<ProcessingResult>? = null,
        page: Int? = null,
        size: Int? = null,
    ): GetSequenceResponse {
        log.info {
            "getting sequences for user ${authenticatedUser.username} " +
                "(organism: $organism, groupFilter: $groupIdsFilter, statusFilter: $statusesFilter, " +
                "processingResultFilter: $processingResultFilter, page: $page, pageSize: $size)"
        }

        val statusCondition = when (statusesFilter) {
            null -> Op.TRUE
            else -> SequenceEntriesView.statusIsOneOf(statusesFilter)
        }
        val groupCondition = getGroupCondition(groupIdsFilter, authenticatedUser)
        val organismCondition = SequenceEntriesView.organismIs(organism)
        val processingResultCondition = when (processingResultFilter) {
            null -> Op.TRUE

            else -> SequenceEntriesView.processingResultIsOneOf(processingResultFilter) or
                // processingResultFilter has no effect on sequences in states other than PROCESSED
                not(SequenceEntriesView.statusIs(Status.PROCESSED))
        }

        val entries = SequenceEntriesView
            .join(
                DataUseTermsTable,
                JoinType.LEFT,
                additionalConstraint = {
                    (SequenceEntriesView.accessionColumn eq DataUseTermsTable.accessionColumn) and
                        (DataUseTermsTable.isNewestDataUseTerms)
                },
            )
            .select(
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.submissionIdColumn,
                SequenceEntriesView.statusColumn,
                SequenceEntriesView.isRevocationColumn,
                SequenceEntriesView.groupIdColumn,
                SequenceEntriesView.submitterColumn,
                SequenceEntriesView.processingResultColumn,
                DataUseTermsTable.dataUseTermsTypeColumn,
                DataUseTermsTable.restrictedUntilColumn,
            )
            .where { groupCondition and organismCondition and statusCondition and processingResultCondition }
            .orderBy(SequenceEntriesView.accessionColumn)
            .apply {
                if (page != null && size != null) {
                    limit(size).offset((page * size).toLong())
                }
            }
            .map { row ->
                SequenceEntryStatus(
                    accession = row[SequenceEntriesView.accessionColumn],
                    version = row[SequenceEntriesView.versionColumn],
                    status = Status.fromString(row[SequenceEntriesView.statusColumn]),
                    processingResult = if (row[SequenceEntriesView.processingResultColumn] != null) {
                        ProcessingResult.fromString(row[SequenceEntriesView.processingResultColumn])
                    } else {
                        null
                    },
                    groupId = row[SequenceEntriesView.groupIdColumn],
                    submitter = row[SequenceEntriesView.submitterColumn],
                    isRevocation = row[SequenceEntriesView.isRevocationColumn],
                    submissionId = row[SequenceEntriesView.submissionIdColumn],
                    dataUseTerms = DataUseTerms.fromParameters(
                        DataUseTermsType.fromString(row[DataUseTermsTable.dataUseTermsTypeColumn]),
                        row[DataUseTermsTable.restrictedUntilColumn],
                    ),
                )
            }

        val processingResultCounts = getProcessingResultCounts(organism, groupCondition)
        val statusCounts = getStatusCounts(organism, groupCondition)

        return GetSequenceResponse(
            sequenceEntries = entries,
            statusCounts = statusCounts,
            processingResultCounts = processingResultCounts,
        )
    }

    private fun getStatusCounts(organism: Organism, groupCondition: Op<Boolean>): Map<Status, Int> {
        val statusColumn = SequenceEntriesView.statusColumn
        val countColumn = Count(stringLiteral("*"))

        val statusCounts = SequenceEntriesView
            .select(statusColumn, countColumn)
            .where { SequenceEntriesView.organismIs(organism) and groupCondition }
            .groupBy(statusColumn)
            .associate { Status.fromString(it[statusColumn]) to it[countColumn].toInt() }

        return Status.entries.associateWith { statusCounts[it] ?: 0 }
    }

    /**
     * How many processing results have errors, just warnings, or none?
     * Considers only SequenceEntries that are PROCESSED.
     */
    private fun getProcessingResultCounts(
        organism: Organism,
        groupCondition: Op<Boolean>,
    ): Map<ProcessingResult, Int> {
        val processingResultColumn = SequenceEntriesView.processingResultColumn
        val countColumn = Count(stringLiteral("*"))

        val processingResultCounts = SequenceEntriesView
            .select(processingResultColumn, countColumn)
            .where {
                SequenceEntriesView.organismIs(organism) and groupCondition and
                    SequenceEntriesView.statusIs(Status.PROCESSED)
            }
            .groupBy(processingResultColumn)
            .associate { ProcessingResult.fromString(it[processingResultColumn]) to it[countColumn].toInt() }

        return ProcessingResult.entries.associateWith { processingResultCounts[it] ?: 0 }
    }

    fun getPipelineVersionStatistics(): Map<String, Map<Long, Int>> {
        val result = mutableMapOf<String, MutableMap<Long, Int>>()
        val sql = """
            SELECT se.organism, sep.pipeline_version, COUNT(*) as count
            FROM sequence_entries_preprocessed_data sep
            JOIN sequence_entries se ON se.accession = sep.accession AND se.version = sep.version
            WHERE sep.processing_status = 'PROCESSED'
            GROUP BY se.organism, sep.pipeline_version
        """.trimIndent()
        transaction {
            exec(sql) { rs ->
                while (rs.next()) {
                    val organism = rs.getString("organism")
                    val version = rs.getLong("pipeline_version")
                    val count = rs.getInt("count")
                    result.getOrPut(organism) { mutableMapOf() }[version] = count
                }
            }
        }

        return result
    }

    fun revoke(
        accessions: List<Accession>,
        authenticatedUser: AuthenticatedUser,
        organism: Organism,
        versionComment: String?,
    ): List<SubmissionIdMapping> {
        log.info { "revoking ${accessions.size} sequences" }

        accessionPreconditionValidator.validate {
            thatAccessionsExist(accessions)
                .andThatUserIsAllowedToEditSequenceEntries(authenticatedUser)
                .andThatSequenceEntriesAreInStates(listOf(Status.APPROVED_FOR_RELEASE))
                .andThatOrganismIs(organism)
        }

        SequenceEntriesTable.insert(
            SequenceEntriesTable.select(
                SequenceEntriesTable.accessionColumn, SequenceEntriesTable.versionColumn.plus(1),
                when (versionComment) {
                    null -> Op.nullOp()
                    else -> stringParam(versionComment)
                },
                SequenceEntriesTable.submissionIdColumn,
                stringParam(authenticatedUser.username),
                SequenceEntriesTable.groupIdColumn,
                dateTimeParam(dateProvider.getCurrentDateTime()),
                booleanParam(true), SequenceEntriesTable.organismColumn,
            ).where {
                (
                    SequenceEntriesTable.accessionColumn inList
                        accessions
                    ) and
                    SequenceEntriesTable.isMaxVersion
            },
            columns = listOf(
                SequenceEntriesTable.accessionColumn,
                SequenceEntriesTable.versionColumn,
                SequenceEntriesTable.versionCommentColumn,
                SequenceEntriesTable.submissionIdColumn,
                SequenceEntriesTable.submitterColumn,
                SequenceEntriesTable.groupIdColumn,
                SequenceEntriesTable.submittedAtTimestampColumn,
                SequenceEntriesTable.isRevocationColumn,
                SequenceEntriesTable.organismColumn,
            ),
        )

        auditLogger.log(
            authenticatedUser.username,
            "Revoked ${accessions.size} sequences: " +
                accessions.joinToString(),
        )

        return SequenceEntriesView
            .select(
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.isRevocationColumn,
                SequenceEntriesView.groupIdColumn,
                SequenceEntriesView.submissionIdColumn,
            )
            .where {
                (SequenceEntriesView.accessionColumn inList accessions) and
                    SequenceEntriesView.isMaxVersion and
                    SequenceEntriesView.statusIs(Status.PROCESSED) and
                    SequenceEntriesView.processingResultIsOneOf(
                        listOf(HAS_WARNINGS, NO_ISSUES),
                    )
            }
            .orderBy(SequenceEntriesView.accessionColumn)
            .map {
                SubmissionIdMapping(
                    it[SequenceEntriesView.accessionColumn],
                    it[SequenceEntriesView.versionColumn],
                    it[SequenceEntriesView.submissionIdColumn],
                )
            }
    }

    fun deleteSequenceEntryVersions(
        accessionVersionsFilter: List<AccessionVersion>?,
        authenticatedUser: AuthenticatedUser,
        groupIdsFilter: List<Int>?,
        organism: Organism,
        scope: DeleteSequenceScope,
    ): List<AccessionVersion> {
        if (accessionVersionsFilter == null) {
            log.info {
                "deleting all sequences of all groups ${authenticatedUser.username} is member of in the scope $scope"
            }
        } else {
            log.info {
                "deleting ${accessionVersionsFilter.size} sequences by ${authenticatedUser.username} in scope $scope"
            }
        }

        val listOfDeletableStatuses = listOf(
            Status.RECEIVED,
            Status.PROCESSED,
        )

        if (accessionVersionsFilter != null) {
            accessionPreconditionValidator.validate {
                thatAccessionVersionsExist(accessionVersionsFilter)
                    .andThatUserIsAllowedToEditSequenceEntries(authenticatedUser)
                    .andThatSequenceEntriesAreInStates(listOfDeletableStatuses)
                    .andThatOrganismIs(organism)
            }
        }

        val accessionCondition = if (accessionVersionsFilter != null) {
            SequenceEntriesView.accessionVersionIsIn(accessionVersionsFilter)
        } else if (authenticatedUser.isSuperUser) {
            Op.TRUE
        } else {
            SequenceEntriesView.groupIsOneOf(groupManagementDatabaseService.getGroupIdsOfUser(authenticatedUser))
        }

        val scopeCondition = when (scope) {
            DeleteSequenceScope.PROCESSED_WITH_ERRORS -> SequenceEntriesView.statusIs(Status.PROCESSED) and
                SequenceEntriesView.processingResultIs(HAS_ERRORS)

            DeleteSequenceScope.PROCESSED_WITH_WARNINGS -> SequenceEntriesView.statusIs(Status.PROCESSED) and
                SequenceEntriesView.processingResultIs(HAS_WARNINGS)

            DeleteSequenceScope.ALL -> SequenceEntriesView.statusIsOneOf(listOfDeletableStatuses)
        }

        val groupCondition = getGroupCondition(groupIdsFilter, authenticatedUser)
        val organismCondition = SequenceEntriesView.organismIs(organism)

        val sequenceEntriesToDelete = SequenceEntriesView
            .select(SequenceEntriesView.accessionColumn, SequenceEntriesView.versionColumn)
            .where { accessionCondition and scopeCondition and groupCondition and organismCondition }
            .map {
                AccessionVersion(
                    it[SequenceEntriesView.accessionColumn],
                    it[SequenceEntriesView.versionColumn],
                )
            }

        for (accessionVersionsChunk in sequenceEntriesToDelete.chunked(1000)) {
            SequenceEntriesTable.deleteWhere { accessionVersionIsIn(accessionVersionsChunk) }
        }

        auditLogger.log(
            authenticatedUser.username,
            "Delete ${sequenceEntriesToDelete.size} " +
                "unreleased sequences: " + sequenceEntriesToDelete.joinToString { it.displayAccessionVersion() },
        )

        return sequenceEntriesToDelete
    }

    fun submitEditedData(
        authenticatedUser: AuthenticatedUser,
        editedSequenceEntryData: EditedSequenceEntryData,
        organism: Organism,
    ) {
        log.info { "edited sequence entry submitted $editedSequenceEntryData" }

        accessionPreconditionValidator.validate {
            thatAccessionVersionExists(editedSequenceEntryData)
                .andThatUserIsAllowedToEditSequenceEntries(authenticatedUser)
                .andThatSequenceEntriesAreInStates(listOf(Status.PROCESSED))
                .andThatOrganismIs(organism)
        }

        editedSequenceEntryData.data.files?.let { fileMapping ->
            fileMappingPreconditionValidator
                .validateFilenameCharacters(fileMapping)
                .validateFilenamesAreUnique(fileMapping)
                .validateCategoriesMatchSubmissionSchema(fileMapping, organism)
                .validateMultipartUploads(fileMapping.fileIds)
                .validateFilesExist(fileMapping.fileIds)
        }

        SequenceEntriesTable.update(
            where = {
                SequenceEntriesTable.accessionVersionIsIn(listOf(editedSequenceEntryData))
            },
        ) {
            it[originalDataColumn] = compressionService
                .compressSequencesInOriginalData(editedSequenceEntryData.data, organism)
        }

        SequenceEntriesPreprocessedDataTable.deleteWhere {
            accessionVersionEquals(editedSequenceEntryData)
        }

        auditLogger.log(
            authenticatedUser.username,
            "Edited sequence: " +
                editedSequenceEntryData.displayAccessionVersion(),
        )
    }

    fun getSequenceEntryVersionToEdit(
        authenticatedUser: AuthenticatedUser,
        accessionVersion: AccessionVersion,
        organism: Organism,
    ): SequenceEntryVersionToEdit {
        log.info {
            "Getting sequence entry ${accessionVersion.displayAccessionVersion()} " +
                "by ${authenticatedUser.username} to edit"
        }

        accessionPreconditionValidator.validate {
            thatAccessionVersionExists(accessionVersion)
                .andThatUserIsAllowedToEditSequenceEntries(authenticatedUser)
                .andThatOrganismIs(organism)
        }

        val selectedSequenceEntry = SequenceEntriesView.select(
            SequenceEntriesView.accessionColumn,
            SequenceEntriesView.versionColumn,
            SequenceEntriesView.groupIdColumn,
            SequenceEntriesView.statusColumn,
            SequenceEntriesView.processedDataColumn,
            SequenceEntriesView.originalDataColumn,
            SequenceEntriesView.errorsColumn,
            SequenceEntriesView.warningsColumn,
            SequenceEntriesView.isRevocationColumn,
            SequenceEntriesView.submissionIdColumn,
        )
            .where { SequenceEntriesView.accessionVersionEquals(accessionVersion) }
            .first()

        if (selectedSequenceEntry[SequenceEntriesView.isRevocationColumn]) {
            throw UnprocessableEntityException(
                "Accession version ${accessionVersion.displayAccessionVersion()} is a revocation.",
            )
        }

        return SequenceEntryVersionToEdit(
            accession = selectedSequenceEntry[SequenceEntriesView.accessionColumn],
            version = selectedSequenceEntry[SequenceEntriesView.versionColumn],
            status = Status.fromString(selectedSequenceEntry[SequenceEntriesView.statusColumn]),
            groupId = selectedSequenceEntry[SequenceEntriesView.groupIdColumn],
            processedData = processedDataPostprocessor.retrieveFromStoredValue(
                selectedSequenceEntry[SequenceEntriesView.processedDataColumn]!!,
                organism,
            ),
            originalData = compressionService.decompressSequencesInOriginalData(
                selectedSequenceEntry[SequenceEntriesView.originalDataColumn]!!,
            ),
            errors = selectedSequenceEntry[SequenceEntriesView.errorsColumn],
            warnings = selectedSequenceEntry[SequenceEntriesView.warningsColumn],
            submissionId = selectedSequenceEntry[SequenceEntriesView.submissionIdColumn],
        )
    }

    /**
     * Returns AccessionVersions submitted by groups that the given user is part of
     * and that are approved for release.
     */
    fun getApprovedUserAccessionVersions(authenticatedUser: AuthenticatedUser): List<AccessionVersion> =
        SequenceEntriesView.select(
            SequenceEntriesView.accessionColumn,
            SequenceEntriesView.versionColumn,
        )
            .where(SequenceEntriesView.statusIs(APPROVED_FOR_RELEASE))
            .groupBy(getGroupCondition(null, authenticatedUser))
            .map {
                AccessionVersion(
                    it[SequenceEntriesView.accessionColumn],
                    it[SequenceEntriesView.versionColumn],
                )
            }

    private fun originalMetadataFilter(
        authenticatedUser: AuthenticatedUser,
        organism: Organism,
        groupIdsFilter: List<Int>?,
        statusesFilter: List<Status>?,
    ): Op<Boolean> {
        val organismCondition = SequenceEntriesView.organismIs(organism)
        val groupCondition = getGroupCondition(groupIdsFilter, authenticatedUser)
        val statusCondition = if (statusesFilter != null) {
            SequenceEntriesView.statusIsOneOf(statusesFilter)
        } else {
            Op.TRUE
        }
        val conditions = organismCondition and groupCondition and statusCondition

        return conditions
    }

    fun countOriginalMetadata(
        authenticatedUser: AuthenticatedUser,
        organism: Organism,
        groupIdsFilter: List<Int>?,
        statusesFilter: List<Status>?,
    ): Long = SequenceEntriesView
        .selectAll()
        .where(
            originalMetadataFilter(
                authenticatedUser,
                organism,
                groupIdsFilter,
                statusesFilter,
            ),
        )
        .count()

    fun streamOriginalMetadata(
        authenticatedUser: AuthenticatedUser,
        organism: Organism,
        groupIdsFilter: List<Int>?,
        statusesFilter: List<Status>?,
        fields: List<String>?,
    ): Sequence<AccessionVersionOriginalMetadata> {
        val originalMetadata = SequenceEntriesView.originalDataColumn
            // It's actually <Map<String, String>?> but exposed does not support nullable types here
            .extract<Map<String, String>>("metadata")
            .alias("original_metadata")

        return SequenceEntriesView
            .select(
                originalMetadata,
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.submitterColumn,
                SequenceEntriesView.isRevocationColumn,
            )
            .where(
                originalMetadataFilter(
                    authenticatedUser,
                    organism,
                    groupIdsFilter,
                    statusesFilter,
                ),
            )
            .fetchSize(streamBatchSize)
            .asSequence()
            .map {
                // Revoked sequences have no original metadata, hence null can happen
                @Suppress("USELESS_ELVIS")
                val metadata = it[originalMetadata] ?: null
                val selectedMetadata = fields?.associateWith { field -> metadata?.get(field) }
                    ?: metadata
                AccessionVersionOriginalMetadata(
                    it[SequenceEntriesView.accessionColumn],
                    it[SequenceEntriesView.versionColumn],
                    it[SequenceEntriesView.submitterColumn],
                    it[SequenceEntriesView.isRevocationColumn],
                    selectedMetadata,
                )
            }
    }

    fun cleanUpStaleSequencesInProcessing(timeToStaleInSeconds: Long) {
        val staleDateTime = dateProvider.getCurrentInstant()
            .minus(timeToStaleInSeconds, DateTimeUnit.SECOND, DateProvider.timeZone)
            .toLocalDateTime(DateProvider.timeZone)

        // Check if there are any stale sequences before attempting to delete
        val staleSequencesExist = SequenceEntriesPreprocessedDataTable
            .selectAll()
            .where {
                SequenceEntriesPreprocessedDataTable.statusIs(IN_PROCESSING) and
                    (SequenceEntriesPreprocessedDataTable.startedProcessingAtColumn.less(staleDateTime))
            }
            .limit(1)
            .count() > 0

        if (staleSequencesExist) {
            val numberDeleted = SequenceEntriesPreprocessedDataTable.deleteWhere {
                statusIs(IN_PROCESSING) and startedProcessingAtColumn.less(staleDateTime)
            }
            log.info { "Cleaned up $numberDeleted stale sequences in processing" }
        } else {
            log.info { "No stale sequences found for cleanup" }
        }
    }

    fun useNewerProcessingPipelineIfPossible(): Map<String, Long?> {
        val latestUpdate = transaction {
            UpdateTrackerTable
                .select(UpdateTrackerTable.lastTimeUpdatedDbColumn)
                .where { UpdateTrackerTable.tableNameColumn eq SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME }
                .map { it[UpdateTrackerTable.lastTimeUpdatedDbColumn] }
                .firstOrNull()
        }

        if (latestUpdate == null || latestUpdate == lastPreprocessedDataUpdate) {
            log.info {
                "No updates in $SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME; skipping pipeline version check"
            }
            return emptyMap()
        }

        lastPreprocessedDataUpdate = latestUpdate

        return SequenceEntriesTable.distinctOrganisms().associateWith { organismName ->
            useNewerProcessingPipelineIfPossible(organismName)
        }
    }

    /**
     * Delete all entries from the [SequenceEntriesPreprocessedDataTable] that belong to
     * the given organism and are older than the earliest preprocessing pipeline version to keep.
     */
    fun cleanUpOutdatedPreprocessingData(organism: String, earliestVersionToKeep: Long) {
        val sql = """
        DELETE FROM sequence_entries_preprocessed_data
        WHERE pipeline_version < ? AND 
        (accession, version) IN (
            SELECT sep.accession, sep.version
            FROM sequence_entries_preprocessed_data sep
            JOIN sequence_entries se ON sep.accession = se.accession AND sep.version = se.version
            WHERE se.organism = ?
        )
        """.trimIndent()
        transaction {
            exec(
                sql,
                listOf(
                    Pair(LongColumnType(), earliestVersionToKeep),
                    Pair(VarCharColumnType(), organism),
                ),
                explicitStatementType = StatementType.DELETE,
            )
        }
    }

    /**
     * Looks for new preprocessing pipeline version with [findNewPreprocessingPipelineVersion];
     * if a new version is found, the [CurrentProcessingPipelineTable] is updated accordingly.
     * If the [CurrentProcessingPipelineTable] is updated, the newly set version is returned.
     */
    private fun useNewerProcessingPipelineIfPossible(organismName: String): Long? {
        log.info("Checking for newer processing pipeline versions for organism '$organismName'")
        return transaction {
            val newVersion = findNewPreprocessingPipelineVersion(organismName)
                ?: return@transaction null

            val pipelineNeedsUpdate = CurrentProcessingPipelineTable.pipelineNeedsUpdate(newVersion, organismName)

            if (pipelineNeedsUpdate) {
                log.info { "Updating current processing pipeline to newer version: $newVersion" }
                CurrentProcessingPipelineTable.updatePipelineVersion(
                    organismName,
                    newVersion,
                    dateProvider.getCurrentDateTime(),
                )
            }

            val logMessage = "Started using results from new processing pipeline: version $newVersion"
            log.info(logMessage)
            auditLogger.log(logMessage)
            newVersion
        }
    }

    fun getFileIdAndReleasedAt(
        accessionVersion: AccessionVersion,
        fileCategory: FileCategory,
        fileName: String,
    ): FileIdAndMaybeReleasedAt? = SequenceEntriesView.select(
        SequenceEntriesView.processedDataColumn,
        SequenceEntriesView.releasedAtTimestampColumn,
    )
        .where {
            SequenceEntriesView.accessionVersionEquals(accessionVersion)
        }
        .map {
            val fileId = it[SequenceEntriesView.processedDataColumn]?.files?.getFileId(fileCategory, fileName)
            if (fileId != null) {
                FileIdAndMaybeReleasedAt(
                    fileId,
                    it[SequenceEntriesView.releasedAtTimestampColumn],
                )
            } else {
                null
            }
        }.firstOrNull()

    fun getReleasedAt(accessionVersions: List<AccessionVersion>): Map<AccessionVersion, LocalDateTime?> =
        accessionVersions
            .chunked(32767) // PostgreSQL allows up to 65,535 query parameters, allowing for max 32767 entries
            .flatMap { chunk ->
                SequenceEntriesView
                    .select(
                        SequenceEntriesView.accessionColumn,
                        SequenceEntriesView.versionColumn,
                        SequenceEntriesView.releasedAtTimestampColumn,
                    )
                    .where(SequenceEntriesView.accessionVersionIsIn(chunk))
                    .map {
                        AccessionVersion(
                            it[SequenceEntriesView.accessionColumn],
                            it[SequenceEntriesView.versionColumn],
                        ) to it[SequenceEntriesView.releasedAtTimestampColumn]
                    }
            }
            .toMap()
}

private fun Transaction.findNewPreprocessingPipelineVersion(organism: String): Long? {
    // Maybe we want to refactor this function: https://github.com/loculus-project/loculus/issues/3571

    // This query goes into the processed data and finds _any_ processed data that was processed
    // with a pipeline version greater than the current one.
    // If such a version is found ('newer.pipeline_version'), we go in and check some stuff.
    // We look at all the data that was processed successfully with the current pipeline version,
    // and then we check whether all of these were also successfully processed with the newer version.
    // If any accession.version either was processed unsuccessfully with the new version, or just wasn't
    // processed yet -> we _don't_ return the new version yet.

    val sql = """
        select
            newest.version as version
        from
            (
                select max(pipeline_version) as version
                from
                    ( -- Newer pipeline versions...
                        select distinct sep.pipeline_version
                        from sequence_entries_preprocessed_data sep
                        join sequence_entries se
                            on se.accession = sep.accession
                            and se.version = sep.version
                        where 
                            se.organism = ?
                            and sep.pipeline_version > (select version from current_processing_pipeline
                                                        where organism = ?)
                    ) as newer
                where
                    not exists( -- ...for which no sequence exists...
                        select
                        from
                            ( -- ...that was processed successfully with the current version...
                                select sep.accession, sep.version
                                from sequence_entries_preprocessed_data sep
                                join sequence_entries se
                                    on se.accession = sep.accession
                                    and se.version = sep.version
                                where
                                    se.organism = ?
                                    and sep.pipeline_version = (select version from current_processing_pipeline
                                                                where organism = ?)
                                    and sep.processing_status = 'PROCESSED'
                                    and (sep.errors is null or jsonb_array_length(sep.errors) = 0)
                            ) as successful
                        where
                            -- ...but not successfully with the newer version.
                            not exists(
                                select
                                from sequence_entries_preprocessed_data this
                                where
                                    this.pipeline_version = newer.pipeline_version
                                    and this.accession = successful.accession
                                    and this.version = successful.version
                                    and processing_status = 'PROCESSED'
                                    and (errors is null or jsonb_array_length(errors) = 0)
                            )
                    )
            ) as newest;
    """.trimIndent()

    return exec(
        sql,
        listOf(
            Pair(VarCharColumnType(), organism),
            Pair(VarCharColumnType(), organism),
            Pair(VarCharColumnType(), organism),
            Pair(VarCharColumnType(), organism),
        ),
        explicitStatementType = StatementType.SELECT,
    ) { resultSet ->
        if (!resultSet.next()) {
            return@exec null
        }

        val version = resultSet.getLong("version")
        when {
            resultSet.wasNull() -> null
            else -> version
        }
    }
}

data class RawProcessedData(
    override val accession: Accession,
    override val version: Version,
    val isRevocation: Boolean,
    val versionComment: String?,
    val submitter: String,
    val groupId: Int,
    val groupName: String,
    val submittedAtTimestamp: LocalDateTime,
    val releasedAtTimestamp: LocalDateTime,
    val submissionId: String,
    val processedData: ProcessedData<GeneticSequence>,
    val pipelineVersion: Long,
    val dataUseTerms: DataUseTerms,
    val dataUseTermsChangeDate: LocalDateTime?,
) : AccessionVersionInterface
