package org.loculus.backend.service.submission

import com.fasterxml.jackson.core.JacksonException
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.v1.core.ArrayColumnType
import org.jetbrains.exposed.v1.core.Count
import org.jetbrains.exposed.v1.core.JoinType
import org.jetbrains.exposed.v1.core.LongColumnType
import org.jetbrains.exposed.v1.core.Op
import org.jetbrains.exposed.v1.core.QueryParameter
import org.jetbrains.exposed.v1.core.SortOrder
import org.jetbrains.exposed.v1.core.TextColumnType
import org.jetbrains.exposed.v1.core.VarCharColumnType
import org.jetbrains.exposed.v1.core.alias
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.booleanParam
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.greaterEq
import org.jetbrains.exposed.v1.core.inList
import org.jetbrains.exposed.v1.core.isNotNull
import org.jetbrains.exposed.v1.core.less
import org.jetbrains.exposed.v1.core.lessEq
import org.jetbrains.exposed.v1.core.longParam
import org.jetbrains.exposed.v1.core.max
import org.jetbrains.exposed.v1.core.not
import org.jetbrains.exposed.v1.core.notExists
import org.jetbrains.exposed.v1.core.or
import org.jetbrains.exposed.v1.core.plus
import org.jetbrains.exposed.v1.core.statements.StatementType
import org.jetbrains.exposed.v1.core.stringLiteral
import org.jetbrains.exposed.v1.core.stringParam
import org.jetbrains.exposed.v1.core.vendors.ForUpdateOption.PostgreSQL.ForKeyShare
import org.jetbrains.exposed.v1.core.vendors.ForUpdateOption.PostgreSQL.ForUpdate
import org.jetbrains.exposed.v1.core.vendors.ForUpdateOption.PostgreSQL.MODE
import org.jetbrains.exposed.v1.datetime.KotlinLocalDateTimeColumnType
import org.jetbrains.exposed.v1.datetime.dateTimeParam
import org.jetbrains.exposed.v1.jdbc.JdbcTransaction
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.insertIgnore
import org.jetbrains.exposed.v1.jdbc.select
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.TransactionManager
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update
import org.jetbrains.exposed.v1.json.extract
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.AccessionVersionSubmittedMetadata
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
import org.loculus.backend.api.PreprocessingAnnotation
import org.loculus.backend.api.PreprocessingStatus.IN_PROCESSING
import org.loculus.backend.api.PreprocessingStatus.PROCESSED
import org.loculus.backend.api.PreprocessingStatus.UNPROCESSED
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
import org.loculus.backend.api.SubmittedContentWithFileUrls
import org.loculus.backend.api.SubmittedData
import org.loculus.backend.api.SubmittedDataDownloadEntry
import org.loculus.backend.api.SubmittedProcessedData
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.api.fileIds
import org.loculus.backend.api.getFileId
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.BadRequestException
import org.loculus.backend.controller.ProcessingValidationException
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.metrics.STORE_PREPROCESSED_DATA_PHASE
import org.loculus.backend.metrics.SUBMIT_PROCESSED_DATA_ENDPOINT
import org.loculus.backend.metrics.SubmissionMetrics
import org.loculus.backend.service.datauseterms.DataUseTermsTable
import org.loculus.backend.service.files.FileId
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.files.S3Service
import org.loculus.backend.service.groupmanagement.GroupEntity
import org.loculus.backend.service.groupmanagement.GroupManagementDatabaseService
import org.loculus.backend.service.groupmanagement.GroupManagementPreconditionValidator
import org.loculus.backend.service.serialize
import org.loculus.backend.service.submission.SequenceEntriesTable.accessionColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.groupIdColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.versionColumn
import org.loculus.backend.service.submission.dbtables.CurrentProcessingPipelineTable
import org.loculus.backend.service.submission.dbtables.ExternalMetadataTable
import org.loculus.backend.service.submission.dbtables.PreprocessingQueueVersionsTable
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
import java.util.UUID
import kotlin.time.Instant

private val log = KotlinLogging.logger { }

@Service
@Transactional
class SubmissionDatabaseService(
    private val processedSequenceEntryValidatorFactory: ProcessedSequenceEntryValidatorFactory,
    private val externalMetadataValidatorFactory: ExternalMetadataValidatorFactory,
    private val accessionPreconditionValidator: AccessionPreconditionValidator,
    private val backendConfig: BackendConfig,
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
    private val submissionMetrics: SubmissionMetrics,
    // A whole batch is serialized in memory before it is stored, so raising this multiplies peak heap.
    @Value("\${${BackendSpringProperty.STREAM_BATCH_SIZE}}") private val streamBatchSize: Int,
    @Value("\${${BackendSpringProperty.STALE_AFTER_SECONDS}}") private val processingLeaseDurationSeconds: Long,
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

    fun getAllCurrentProcessingPipelineVersions(): Map<String, Long> {
        val table = CurrentProcessingPipelineTable
        return table
            .selectAll()
            .associate { it[table.organismColumn] to it[table.versionColumn] }
    }

    // Registers the queue of a pipeline version. Returns true until the backfill has completed.
    fun registerPreprocessingQueueVersion(organism: Organism, pipelineVersion: Long): Boolean {
        val queueVersions = PreprocessingQueueVersionsTable
        val registration = queueVersions
            .select(queueVersions.initializedAtColumn)
            .where {
                (queueVersions.organismColumn eq organism.name) and
                    (queueVersions.pipelineVersionColumn eq pipelineVersion)
            }
            .firstOrNull()
        if (registration != null) {
            return registration[queueVersions.initializedAtColumn] == null
        }

        // Blocks concurrent inserts, so every entry is either seen by the backfill or queued by its submission.
        TransactionManager.current().exec("LOCK TABLE sequence_entries IN SHARE ROW EXCLUSIVE MODE")
        val currentPipelineVersion = getCurrentProcessingPipelineVersion(organism)
        if (pipelineVersion < currentPipelineVersion) {
            throw UnprocessableEntityException(
                "The processing pipeline version $pipelineVersion is not accepted anymore. " +
                    "The current pipeline version is $currentPipelineVersion.",
            )
        }
        queueVersions.insertIgnore {
            it[organismColumn] = organism.name
            it[pipelineVersionColumn] = pipelineVersion
        }
        return true
    }

    // Runs in its own transaction, after the registration lock has been released.
    fun backfillPreprocessingQueue(organism: Organism, pipelineVersion: Long) {
        val queueVersions = PreprocessingQueueVersionsTable
        // One backfill at a time. A concurrent caller skips it, its claim finds nothing yet and polls again.
        val pending = queueVersions
            .select(queueVersions.initializedAtColumn)
            .where {
                (queueVersions.organismColumn eq organism.name) and
                    (queueVersions.pipelineVersionColumn eq pipelineVersion)
            }
            .forUpdate(ForUpdate(mode = MODE.SKIP_LOCKED))
            .firstOrNull()
            ?.let { it[queueVersions.initializedAtColumn] == null }
            ?: false
        if (!pending) {
            return
        }

        enqueueEntriesWithoutQueueRow(organism.name, pipelineVersion)
        queueVersions.update(
            where = {
                (queueVersions.organismColumn eq organism.name) and
                    (queueVersions.pipelineVersionColumn eq pipelineVersion)
            },
        ) {
            it[initializedAtColumn] = dateProvider.getCurrentDateTime()
        }
    }

    // Queues entries that missed the enqueue at submission, e.g. ones a backend from before the queue
    // accepted during a rolling deploy. Versions whose backfill has not finished are left to the backfill.
    fun enqueueMissingPreprocessingEntries() {
        val queueVersions = PreprocessingQueueVersionsTable
        // Retiring a version deletes its row and waits for this lock, so nothing is queued for it afterwards.
        val versions = queueVersions
            .select(queueVersions.organismColumn, queueVersions.pipelineVersionColumn)
            .where { queueVersions.initializedAtColumn.isNotNull() }
            .forUpdate(ForKeyShare())
            .map { it[queueVersions.organismColumn] to it[queueVersions.pipelineVersionColumn] }

        versions.forEach { (organism, pipelineVersion) ->
            val queued = enqueueEntriesWithoutQueueRow(organism, pipelineVersion)
            if (queued > 0) {
                log.warn {
                    "Queued $queued entries of $organism that were missing for pipeline version $pipelineVersion"
                }
            }
        }
    }

    // Revocations are not preprocessed.
    private fun enqueueEntriesWithoutQueueRow(organism: String, pipelineVersion: Long): Int {
        val table = SequenceEntriesTable
        val queue = SequenceEntriesPreprocessedDataTable
        val missingEntries = table
            .select(
                table.accessionColumn,
                table.versionColumn,
                longParam(pipelineVersion),
                table.organismColumn,
                stringLiteral(UNPROCESSED.name),
            )
            .where {
                (table.organismColumn eq organism) and
                    not(table.isRevocationColumn) and
                    notExists(
                        queue.select(queue.accessionColumn).where {
                            (queue.accessionColumn eq table.accessionColumn) and
                                (queue.versionColumn eq table.versionColumn) and
                                (queue.pipelineVersionColumn eq pipelineVersion)
                        },
                    )
            }
        return queue.insertIgnore(
            missingEntries,
            columns = listOf(
                queue.accessionColumn,
                queue.versionColumn,
                queue.pipelineVersionColumn,
                queue.organismColumn,
                queue.processingStatusColumn,
            ),
        ) ?: 0
    }

    private fun fetchUnprocessedEntriesAndUpdateToInProcessing(
        organism: Organism,
        numberOfSequenceEntries: Int,
        pipelineVersion: Long,
    ): Sequence<UnprocessedData> {
        val table = SequenceEntriesTable
        val preprocessing = SequenceEntriesPreprocessedDataTable
        // One attempt id per request. Results must be submitted with it.
        val processingAttemptId = UUID.randomUUID()
        val claimedAt = dateProvider.getCurrentInstant()
        val leaseUntil = claimedAt.plus(processingLeaseDurationSeconds, DateTimeUnit.SECOND, DateProvider.timeZone)

        val claimedCount = claimPreprocessingJobs(
            organism,
            pipelineVersion,
            numberOfSequenceEntries,
            processingAttemptId,
            claimedAt.toLocalDateTime(DateProvider.timeZone),
            leaseUntil.toLocalDateTime(DateProvider.timeZone),
        )
        if (claimedCount == 0) {
            return emptySequence()
        }
        log.info { "Claimed $claimedCount entries for processing attempt $processingAttemptId" }

        return preprocessing
            .join(table, JoinType.INNER) {
                (preprocessing.accessionColumn eq table.accessionColumn) and
                    (preprocessing.versionColumn eq table.versionColumn)
            }
            .select(
                table.accessionColumn,
                table.versionColumn,
                table.submittedDataColumn,
                table.submissionIdColumn,
                table.submitterColumn,
                table.groupIdColumn,
                table.submittedAtTimestampColumn,
            )
            .where { preprocessing.processingAttemptIdColumn eq processingAttemptId }
            .orderBy(table.accessionColumn)
            .fetchSize(streamBatchSize)
            .asSequence()
            .map {
                val submittedData = compressionService.decompressSequencesInSubmittedData(
                    it[table.submittedDataColumn]!!,
                )
                val submittedDataWithFileUrls = SubmittedContentWithFileUrls(
                    submittedData.metadata,
                    submittedData.unalignedNucleotideSequences,
                    submittedData.files?.let {
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
                    processingAttemptId = processingAttemptId,
                    leaseUntil = leaseUntil.epochSeconds,
                    data = submittedDataWithFileUrls,
                    submissionId = it[table.submissionIdColumn],
                    submitter = it[table.submitterColumn],
                    groupId = it[table.groupIdColumn],
                    submittedAt = it[table.submittedAtTimestampColumn].toTimestamp(),
                )
            }
    }

    // Claims the queue head in one statement. Rows held by other workers are skipped.
    private fun claimPreprocessingJobs(
        organism: Organism,
        pipelineVersion: Long,
        numberOfSequenceEntries: Int,
        processingAttemptId: UUID,
        claimedAt: LocalDateTime,
        leaseUntil: LocalDateTime,
    ): Int {
        val queue = SequenceEntriesPreprocessedDataTable
        val candidates = queue
            .select(queue.accessionColumn, queue.versionColumn, queue.pipelineVersionColumn)
            .where {
                (queue.organismColumn eq organism.name) and
                    (queue.pipelineVersionColumn eq pipelineVersion) and
                    queue.statusIs(UNPROCESSED)
            }
            .orderBy(queue.accessionColumn to SortOrder.ASC, queue.versionColumn to SortOrder.ASC)
            .limit(numberOfSequenceEntries)
            .forUpdate(ForUpdate(mode = MODE.SKIP_LOCKED))
            .alias("candidates")

        // Renders as UPDATE ... FROM (candidates) WHERE <join condition>
        return queue
            .join(candidates, JoinType.INNER) {
                (queue.accessionColumn eq candidates[queue.accessionColumn]) and
                    (queue.versionColumn eq candidates[queue.versionColumn]) and
                    (queue.pipelineVersionColumn eq candidates[queue.pipelineVersionColumn])
            }
            .update {
                it[queue.processingStatusColumn] = IN_PROCESSING.name
                it[queue.processingAttemptIdColumn] = processingAttemptId
                it[queue.startedProcessingAtColumn] = claimedAt
                it[queue.leaseUntilColumn] = leaseUntil
            }
    }

    fun updateProcessedData(inputStream: InputStream, organism: Organism, pipelineVersion: Long) {
        submissionMetrics.timeWritePhase(
            SUBMIT_PROCESSED_DATA_ENDPOINT,
            organism.name,
            STORE_PREPROCESSED_DATA_PHASE,
        ) {
            updateProcessedDataAndRecordCount(inputStream, organism, pipelineVersion)
        }
    }

    private fun updateProcessedDataAndRecordCount(inputStream: InputStream, organism: Organism, pipelineVersion: Long) {
        log.info { "updating processed data" }

        val processedAccessionVersions = mutableListOf<String>()
        val seenAccessionVersions = mutableSetOf<AccessionVersion>()
        val processedFiles = mutableMapOf<AccessionVersion, Set<FileId>>()
        val processingResultCounts = mutableMapOf<ProcessingResult, Int>()
        BufferedReader(InputStreamReader(inputStream)).use { reader ->
            // Process the NDJSON stream in chunks so DB lookups are batched without buffering the whole request.
            reader.lineSequence().chunked(streamBatchSize).forEach { lines ->
                val submittedProcessedDataBatch = lines.map { parseSubmittedProcessedDataLine(it) }

                val filesToValidate = validateFileMappingsAndCollectFileIds(
                    submittedProcessedDataBatch,
                    organism,
                    processedFiles,
                )
                validateFilesBelongToSubmittingGroups(filesToValidate)

                val storedResults = submittedProcessedDataBatch.map {
                    prepareProcessedResultForStorage(it, organism)
                }
                rejectDuplicates(storedResults, seenAccessionVersions)
                storeProcessedResults(storedResults, organism, pipelineVersion)

                submittedProcessedDataBatch.forEach { submittedProcessedData ->
                    processedAccessionVersions.add(submittedProcessedData.displayAccessionVersion())
                    processingResultCounts.merge(submittedProcessedData.processingResult(), 1, Int::plus)
                }
            }
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

        submissionMetrics.recordProcessedSequencesStored(
            organism = organism.name,
            count = processedAccessionVersions.size,
        )
    }

    private fun parseSubmittedProcessedDataLine(line: String) = try {
        objectMapper.readValue<SubmittedProcessedData>(line)
    } catch (e: JacksonException) {
        throw BadRequestException("Failed to deserialize NDJSON line: ${e.message}", e)
    }

    private fun validateFileMappingsAndCollectFileIds(
        submittedProcessedDataBatch: List<SubmittedProcessedData>,
        organism: Organism,
        processedFiles: MutableMap<AccessionVersion, Set<FileId>>,
    ): Map<AccessionVersion, Set<FileId>> {
        val filesByAccessionVersion = mutableMapOf<AccessionVersion, Set<FileId>>()
        val allFileIds = mutableSetOf<FileId>()

        submittedProcessedDataBatch.forEach { submittedProcessedData ->
            submittedProcessedData.data.files?.let { fileMapping ->
                fileMappingPreconditionValidator
                    .validateFilenameCharacters(fileMapping)
                    .validateFilenamesAreUnique(fileMapping)
                    // no file-ID uniqueness check: would break reprocessing of older entries
                    .validateCategoriesMatchOutputSchema(fileMapping, organism)

                val accessionVersion =
                    AccessionVersion(submittedProcessedData.accession, submittedProcessedData.version)
                processedFiles[accessionVersion] = fileMapping.fileIds
                filesByAccessionVersion[accessionVersion] = fileMapping.fileIds
                allFileIds.addAll(fileMapping.fileIds)
            }
        }

        fileMappingPreconditionValidator
            .validateMultipartUploads(allFileIds)
            .validateFilesExist(allFileIds)

        return filesByAccessionVersion
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

    private data class StoredProcessedResult(
        val submitted: SubmittedProcessedData,
        val processedData: ProcessedData<CompressedSequence>,
        val errors: List<PreprocessingAnnotation>,
        val warnings: List<PreprocessingAnnotation>,
    )

    private fun prepareProcessedResultForStorage(
        submittedProcessedData: SubmittedProcessedData,
        organism: Organism,
    ): StoredProcessedResult {
        val submittedErrors = submittedProcessedData.errors.orEmpty()
        val submittedWarnings = submittedProcessedData.warnings.orEmpty()
        val processedData = when {
            submittedErrors.isEmpty() -> postprocessAndValidateProcessedData(submittedProcessedData, organism)
            else -> submittedProcessedData.data // No need to validate if there are errors, can't be released anyway
        }

        return StoredProcessedResult(
            submitted = submittedProcessedData,
            processedData = processedDataPostprocessor.prepareForStorage(processedData, organism),
            errors = submittedErrors,
            warnings = submittedWarnings,
        )
    }

    /**
     * One statement per batch updates a repeated accession version only once, and from an
     * arbitrary one of the duplicates. [seen] spans the whole request, so a duplicate is
     * rejected the same way wherever it falls relative to a batch boundary.
     */
    private fun rejectDuplicates(storedResults: List<StoredProcessedResult>, seen: MutableSet<AccessionVersion>) {
        for (storedResult in storedResults) {
            val accessionVersion = AccessionVersion(storedResult.submitted.accession, storedResult.submitted.version)
            if (!seen.add(accessionVersion)) {
                throw UnprocessableEntityException(
                    "Processed results contain duplicate accession version " +
                        accessionVersion.displayAccessionVersion(),
                )
            }
        }
    }

    /**
     * Stores a whole batch of results in one statement. Writing them one by one made every
     * record fire the per statement tracker trigger, and all workers then queued on the single
     * row of table_update_tracker. One statement per batch means that trigger now fires once per
     * batch. A result is only stored for the attempt that holds the lease.
     */
    private fun storeProcessedResults(
        storedResults: List<StoredProcessedResult>,
        organism: Organism,
        pipelineVersion: Long,
    ) {
        if (storedResults.isEmpty()) {
            return
        }

        val sql = """
            UPDATE $SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME AS preprocessed
            SET processing_status = '${PROCESSED.name}',
                processed_data = submitted.processed_data::jsonb,
                errors = submitted.errors::jsonb,
                warnings = submitted.warnings::jsonb,
                finished_processing_at = ?::timestamp,
                processing_attempt_id = NULL,
                lease_until = NULL
            FROM unnest(?::text[], ?::bigint[], ?::uuid[], ?::text[], ?::text[], ?::text[])
                AS submitted(accession, version, processing_attempt_id, processed_data, errors, warnings)
            WHERE preprocessed.accession = submitted.accession
              AND preprocessed.version = submitted.version
              AND preprocessed.pipeline_version = ?::bigint
              AND preprocessed.organism = ?
              AND preprocessed.processing_status = '${IN_PROCESSING.name}'
              AND preprocessed.processing_attempt_id = submitted.processing_attempt_id
            RETURNING preprocessed.accession, preprocessed.version
        """.trimIndent()

        val textArrayColumnType = ArrayColumnType<String, List<String>>(TextColumnType())
        val longArrayColumnType = ArrayColumnType<Long, List<Long>>(LongColumnType())
        val updated = TransactionManager.current().exec(
            sql,
            args = listOf(
                KotlinLocalDateTimeColumnType() to dateProvider.getCurrentDateTime(),
                textArrayColumnType to storedResults.map { it.submitted.accession },
                longArrayColumnType to storedResults.map { it.submitted.version },
                textArrayColumnType to storedResults.map { it.submitted.processingAttemptId.toString() },
                textArrayColumnType to storedResults.map { serialize(it.processedData) },
                textArrayColumnType to storedResults.map { serialize(it.errors) },
                textArrayColumnType to storedResults.map { serialize(it.warnings) },
                LongColumnType() to pipelineVersion,
                VarCharColumnType() to organism.name,
            ),
            // SELECT so that Exposed runs executeQuery and the RETURNING rows can be read.
            explicitStatementType = StatementType.SELECT,
        ) { resultSet ->
            buildSet {
                while (resultSet.next()) {
                    add(AccessionVersion(resultSet.getString("accession"), resultSet.getLong("version")))
                }
            }
        }.orEmpty()

        val failedResult = storedResults.firstOrNull {
            AccessionVersion(it.submitted.accession, it.submitted.version) !in updated
        }
        if (failedResult != null) {
            throwInsertFailedException(failedResult.submitted, organism, pipelineVersion)
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

    private fun throwInsertFailedException(
        submittedProcessedData: SubmittedProcessedData,
        organism: Organism,
        pipelineVersion: Long,
    ) {
        val preprocessing = SequenceEntriesPreprocessedDataTable
        val rows = preprocessing
            .select(
                preprocessing.processingStatusColumn,
                preprocessing.pipelineVersionColumn,
                preprocessing.organismColumn,
                preprocessing.processingAttemptIdColumn,
            )
            .where { preprocessing.accessionVersionEquals(submittedProcessedData) }
            .toList()

        val accessionVersion = submittedProcessedData.displayAccessionVersion()
        if (rows.none { it[preprocessing.processingStatusColumn] == IN_PROCESSING.name }) {
            throw UnprocessableEntityException(
                "Accession version $accessionVersion does not exist or is not awaiting any processing results",
            )
        }
        val rowsOfVersion = rows.filter { it[preprocessing.pipelineVersionColumn] == pipelineVersion }
        if (rowsOfVersion.none { it[preprocessing.processingStatusColumn] == IN_PROCESSING.name }) {
            throw UnprocessableEntityException(
                "Accession version $accessionVersion is not awaiting processing results of version " +
                    "$pipelineVersion (anymore)",
            )
        }
        if (rowsOfVersion.none { it[preprocessing.organismColumn] == organism.name }) {
            throw UnprocessableEntityException(
                "Accession version $accessionVersion is not awaiting processing results for " +
                    "organism ${organism.name}",
            )
        }
        if (rowsOfVersion.none {
                it[preprocessing.processingAttemptIdColumn] == submittedProcessedData.processingAttemptId
            }
        ) {
            throw UnprocessableEntityException(
                "Processing attempt ${submittedProcessedData.processingAttemptId} does not own " +
                    "accession version $accessionVersion",
            )
        }
        throw IllegalStateException(
            "Update processed data: Unexpected error for accession versions $accessionVersion",
        )
    }

    private fun validateFilesBelongToSubmittingGroups(filesByAccessionVersion: Map<AccessionVersion, Set<FileId>>) {
        if (filesByAccessionVersion.isEmpty()) {
            return
        }

        // Files referenced by processed data may become public after release, so they must belong to the sequence group.
        // Load ownership for the whole chunk to avoid one sequence query and one file query per entry.
        val sequenceEntryGroups = SequenceEntriesTable
            .select(accessionColumn, versionColumn, groupIdColumn)
            .where { SequenceEntriesTable.accessionVersionIsIn(filesByAccessionVersion.keys.toList()) }
            .associate {
                AccessionVersion(it[accessionColumn], it[versionColumn]) to it[groupIdColumn]
            }
        val fileGroups = filesDatabaseService.getGroupIds(filesByAccessionVersion.values.flatten().toSet())

        filesByAccessionVersion.forEach { (accessionVersion, fileIds) ->
            // Missing accession/version errors are handled later by insertProcessedData.
            val sequenceEntryGroup = sequenceEntryGroups[accessionVersion] ?: return@forEach
            fileIds.forEach { fileId ->
                val fileGroup = fileGroups[fileId]
                if (fileGroup != sequenceEntryGroup) {
                    throw UnprocessableEntityException(
                        "Accession version ${accessionVersion.displayAccessionVersion()} belongs to " +
                            "group $sequenceEntryGroup but the attached file $fileId belongs to the group $fileGroup.",
                    )
                }
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
    fun countReleasedSubmissions(organism: Organism): Long {
        val startTime = dateProvider.getCurrentInstant()
        val result = SequenceEntriesView.select(
            SequenceEntriesView.accessionColumn,
        ).where {
            SequenceEntriesView.statusIs(Status.APPROVED_FOR_RELEASE) and SequenceEntriesView.organismIs(
                organism,
            )
        }.count()
        log.info { "Counting released submissions for $organism took ${durationTillNowInMs(startTime)} ms" }
        return result
    }

    // Make sure to keep in sync with countReleasedSubmissions query
    fun streamReleasedSubmissions(organism: Organism): Sequence<RawProcessedData> = SequenceEntriesView.join(
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
            SequenceEntriesView.statusIs(Status.APPROVED_FOR_RELEASE) and SequenceEntriesView.organismIs(
                organism,
            )
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
                .andThatLatestVersionsAreNotRevocations()
                .andThatOrganismIs(organism)
        }

        val metadata = versionComment?.let { mapOf("versionComment" to it) } ?: emptyMap()
        val submittedData = compressionService.compressSequencesInSubmittedData(
            SubmittedData(metadata = metadata, unalignedNucleotideSequences = emptyMap()),
            organism,
        )
        val submittedDataParam = QueryParameter(submittedData, SequenceEntriesTable.submittedDataColumn.columnType)

        SequenceEntriesTable.insert(
            SequenceEntriesTable.select(
                SequenceEntriesTable.accessionColumn,
                SequenceEntriesTable.versionColumn.plus(1),
                SequenceEntriesTable.submissionIdColumn,
                stringParam(authenticatedUser.username),
                SequenceEntriesTable.groupIdColumn,
                dateTimeParam(dateProvider.getCurrentDateTime()),
                booleanParam(true),
                SequenceEntriesTable.organismColumn,
                submittedDataParam,
                submittedDataParam,
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
                SequenceEntriesTable.submissionIdColumn,
                SequenceEntriesTable.submitterColumn,
                SequenceEntriesTable.groupIdColumn,
                SequenceEntriesTable.submittedAtTimestampColumn,
                SequenceEntriesTable.isRevocationColumn,
                SequenceEntriesTable.organismColumn,
                SequenceEntriesTable.archiveOfSubmittedDataColumn,
                SequenceEntriesTable.submittedDataColumn,
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

        val hasConsensusSequence = editedSequenceEntryData.data.unalignedNucleotideSequences.values
            .any { !it.isNullOrBlank() }
        if (backendConfig.consensusSequencesEnabled(organism)) {
            if (!hasConsensusSequence) {
                throw UnprocessableEntityException(
                    "Edited data for accession version " +
                        "${editedSequenceEntryData.displayAccessionVersion()} of organism ${organism.name} " +
                        "must contain at least one consensus sequence.",
                )
            }
        } else if (hasConsensusSequence) {
            throw UnprocessableEntityException(
                "Sequence uploads are not allowed for organism ${organism.name}.",
            )
        }

        editedSequenceEntryData.data.files?.let { fileMapping ->
            fileMappingPreconditionValidator
                .validateFilenameCharacters(fileMapping)
                .validateFilenamesAreUnique(fileMapping)
                .validateFileIdsAreUnique(fileMapping)
                .validateCategoriesMatchSubmissionSchema(fileMapping, organism)
                .validateMultipartUploads(fileMapping.fileIds)
                .validateFilesExist(fileMapping.fileIds)
            validateFilesBelongToSubmittingGroups(
                mapOf(
                    AccessionVersion(editedSequenceEntryData.accession, editedSequenceEntryData.version) to
                        fileMapping.fileIds,
                ),
            )
        }

        val compressedEditedSequenceEntryData = compressionService.compressSequencesInSubmittedData(
            editedSequenceEntryData.data,
            organism,
        )
        SequenceEntriesTable.update(
            where = {
                SequenceEntriesTable.accessionVersionIsIn(listOf(editedSequenceEntryData))
            },
        ) {
            it[submittedDataColumn] = compressedEditedSequenceEntryData
            it[archiveOfSubmittedDataColumn] = compressedEditedSequenceEntryData
        }

        // The row is the queue entry, so it is reset rather than deleted.
        returnToQueue(SequenceEntriesPreprocessedDataTable.accessionVersionEquals(editedSequenceEntryData))

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
            SequenceEntriesView.submittedDataColumn,
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
            submittedData = compressionService.decompressSequencesInSubmittedData(
                selectedSequenceEntry[SequenceEntriesView.submittedDataColumn]!!,
            ),
            errors = selectedSequenceEntry[SequenceEntriesView.errorsColumn],
            warnings = selectedSequenceEntry[SequenceEntriesView.warningsColumn],
            submissionId = selectedSequenceEntry[SequenceEntriesView.submissionIdColumn],
        )
    }

    private fun submittedMetadataFilter(
        authenticatedUser: AuthenticatedUser,
        organism: Organism,
        groupIdsFilter: List<Int>?,
        statusesFilter: List<Status>?,
        accessionVersionsFilter: List<AccessionVersion>?,
    ): Op<Boolean> {
        val organismCondition = SequenceEntriesView.organismIs(organism)
        val groupCondition = getGroupCondition(groupIdsFilter, authenticatedUser)
        val statusCondition = if (statusesFilter != null) {
            SequenceEntriesView.statusIsOneOf(statusesFilter)
        } else {
            Op.TRUE
        }
        val accessionVersionCondition = if (accessionVersionsFilter != null) {
            SequenceEntriesView.accessionVersionIsIn(accessionVersionsFilter)
        } else {
            Op.TRUE
        }
        val conditions = organismCondition and groupCondition and statusCondition and accessionVersionCondition

        return conditions
    }

    fun countSubmittedMetadata(
        authenticatedUser: AuthenticatedUser,
        organism: Organism,
        groupIdsFilter: List<Int>?,
        statusesFilter: List<Status>?,
        accessionVersionsFilter: List<AccessionVersion>?,
    ): Long = SequenceEntriesView
        .selectAll()
        .where(
            submittedMetadataFilter(
                authenticatedUser,
                organism,
                groupIdsFilter,
                statusesFilter,
                accessionVersionsFilter,
            ),
        )
        .count()

    fun streamSubmittedMetadata(
        authenticatedUser: AuthenticatedUser,
        organism: Organism,
        groupIdsFilter: List<Int>?,
        statusesFilter: List<Status>?,
        fields: List<String>?,
        accessionVersionsFilter: List<AccessionVersion>?,
    ): Sequence<AccessionVersionSubmittedMetadata> {
        val submittedMetadata = SequenceEntriesView.submittedDataColumn
            // It's actually <Map<String, String>?> but exposed does not support nullable types here
            .extract<Map<String, String>>("metadata")
            .alias("submitted_metadata")

        return SequenceEntriesView
            .select(
                submittedMetadata,
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.submitterColumn,
                SequenceEntriesView.isRevocationColumn,
            )
            .where(
                submittedMetadataFilter(
                    authenticatedUser,
                    organism,
                    groupIdsFilter,
                    statusesFilter,
                    accessionVersionsFilter,
                ),
            )
            .fetchSize(streamBatchSize)
            .asSequence()
            .map {
                // Revoked sequences have no original metadata, hence null can happen
                @Suppress("USELESS_ELVIS")
                val metadata = it[submittedMetadata] ?: null
                val selectedMetadata = fields?.associateWith { field -> metadata?.get(field) }
                    ?: metadata
                AccessionVersionSubmittedMetadata(
                    it[SequenceEntriesView.accessionColumn],
                    it[SequenceEntriesView.versionColumn],
                    it[SequenceEntriesView.submitterColumn],
                    it[SequenceEntriesView.isRevocationColumn],
                    selectedMetadata,
                )
            }
    }

    private fun submittedDataDownloadConditions(
        organism: Organism,
        groupId: Int,
        accessionsFilter: List<String>?,
    ): Op<Boolean> {
        val accessionsCondition = if (!accessionsFilter.isNullOrEmpty()) {
            SequenceEntriesView.accessionColumn inList accessionsFilter
        } else {
            Op.TRUE
        }

        return SequenceEntriesView.organismIs(organism) and
            (SequenceEntriesView.groupIdColumn eq groupId) and
            SequenceEntriesView.statusIs(APPROVED_FOR_RELEASE) and
            SequenceEntriesView.isMaxVersion and
            (SequenceEntriesView.isRevocationColumn eq false) and
            accessionsCondition
    }

    fun countSubmittedDataDownloadEntries(organism: Organism, groupId: Int, accessionsFilter: List<String>?): Long =
        SequenceEntriesView
            .select(SequenceEntriesView.accessionColumn)
            .where(submittedDataDownloadConditions(organism, groupId, accessionsFilter))
            .count()

    fun streamSubmittedDataDownload(
        organism: Organism,
        groupId: Int,
        accessionsFilter: List<String>?,
    ): Sequence<SubmittedDataDownloadEntry> {
        val submittedDataQuery = SequenceEntriesView.join(
            SequenceEntriesTable,
            JoinType.INNER,
            additionalConstraint = {
                (SequenceEntriesView.accessionColumn eq SequenceEntriesTable.accessionColumn) and
                    (SequenceEntriesView.versionColumn eq SequenceEntriesTable.versionColumn)
            },
        )

        return submittedDataQuery
            .select(
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.submissionIdColumn,
                SequenceEntriesTable.submittedDataColumn,
            )
            .where(submittedDataDownloadConditions(organism, groupId, accessionsFilter))
            .orderBy(SequenceEntriesView.accessionColumn to SortOrder.ASC)
            .fetchSize(streamBatchSize)
            .asSequence()
            .map {
                val compressedSubmittedData = it[SequenceEntriesTable.submittedDataColumn]!!
                val decompressedSubmittedData = compressionService.decompressSequencesInSubmittedData(
                    compressedSubmittedData,
                )
                SubmittedDataDownloadEntry(
                    it[SequenceEntriesView.accessionColumn],
                    it[SequenceEntriesView.versionColumn],
                    it[SequenceEntriesView.submissionIdColumn],
                    decompressedSubmittedData,
                )
            }
    }

    // Expired leases return to the queue. A late result of the old attempt is rejected on submit.
    fun cleanUpStaleSequencesInProcessing() {
        val numberRequeued = returnToQueue(
            SequenceEntriesPreprocessedDataTable.statusIs(IN_PROCESSING) and
                (SequenceEntriesPreprocessedDataTable.leaseUntilColumn lessEq dateProvider.getCurrentDateTime()),
        )
        log.info { "Returned $numberRequeued stale preprocessing jobs to the queue" }
    }

    // Shared reset for expired leases and edits.
    private fun returnToQueue(condition: Op<Boolean>) = SequenceEntriesPreprocessedDataTable.update(
        where = { condition },
    ) {
        it[processingStatusColumn] = UNPROCESSED.name
        it[processingAttemptIdColumn] = null
        it[leaseUntilColumn] = null
        it[startedProcessingAtColumn] = null
        it[finishedProcessingAtColumn] = null
        it[processedDataColumn] = null
        it[errorsColumn] = null
        it[warningsColumn] = null
    }

    fun useNewerProcessingPipelineIfPossible(): Map<String, Long?> {
        // The preprocessed-data tracker now holds one row per (organism, pipeline_version),
        // so take the most recent timestamp across all of them to detect any new processing.
        val latestUpdate = transaction {
            UpdateTrackerTable
                .select(UpdateTrackerTable.lastTimeUpdatedDbColumn)
                .where { UpdateTrackerTable.tableNameColumn eq SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME }
                .map { it[UpdateTrackerTable.lastTimeUpdatedDbColumn] }
                .maxOrNull()
        }

        if (latestUpdate == null || latestUpdate == lastPreprocessedDataUpdate) {
            log.info {
                "No updates in $SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME; skipping pipeline version check"
            }
            return emptyMap()
        }

        val newVersions = SequenceEntriesTable.distinctOrganisms().associateWith { organismName ->
            useNewerProcessingPipelineIfPossible(organismName)
        }
        // Set after the loop, so a failed run is retried.
        lastPreprocessedDataUpdate = latestUpdate
        return newVersions
    }

    /**
     * Delete all entries from the [SequenceEntriesPreprocessedDataTable] that belong to
     * the given organism and are older than the earliest preprocessing pipeline version to keep.
     */
    fun cleanUpOutdatedPreprocessingData(organism: String, earliestVersionToKeep: Long) {
        transaction {
            SequenceEntriesPreprocessedDataTable.deleteWhere {
                (pipelineVersionColumn less earliestVersionToKeep) and (organismColumn eq organism)
            }
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
                // Blocks inserts, so nothing is queued for the version retired below.
                exec("LOCK TABLE sequence_entries IN SHARE ROW EXCLUSIVE MODE")
                CurrentProcessingPipelineTable.updatePipelineVersion(
                    organismName,
                    newVersion,
                    dateProvider.getCurrentDateTime(),
                )
                PreprocessingQueueVersionsTable.deleteWhere {
                    (organismColumn eq organismName) and (pipelineVersionColumn less newVersion)
                }
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

private fun JdbcTransaction.findNewPreprocessingPipelineVersion(organism: String): Long? {
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
