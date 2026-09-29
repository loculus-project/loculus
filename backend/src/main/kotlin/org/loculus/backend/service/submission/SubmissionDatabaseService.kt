package org.loculus.backend.service.submission

import com.fasterxml.jackson.core.JacksonException
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.v1.core.ArrayColumnType
import org.jetbrains.exposed.v1.core.Count
import org.jetbrains.exposed.v1.core.JoinType
import org.jetbrains.exposed.v1.core.LongColumnType
import org.jetbrains.exposed.v1.core.Op
import org.jetbrains.exposed.v1.core.QueryParameter
import org.jetbrains.exposed.v1.core.ResultRow
import org.jetbrains.exposed.v1.core.SortOrder
import org.jetbrains.exposed.v1.core.TextColumnType
import org.jetbrains.exposed.v1.core.VarCharColumnType
import org.jetbrains.exposed.v1.core.alias
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.booleanParam
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.greaterEq
import org.jetbrains.exposed.v1.core.inList
import org.jetbrains.exposed.v1.core.isNull
import org.jetbrains.exposed.v1.core.less
import org.jetbrains.exposed.v1.core.max
import org.jetbrains.exposed.v1.core.not
import org.jetbrains.exposed.v1.core.or
import org.jetbrains.exposed.v1.core.plus
import org.jetbrains.exposed.v1.core.statements.StatementType
import org.jetbrains.exposed.v1.core.stringLiteral
import org.jetbrains.exposed.v1.core.stringParam
import org.jetbrains.exposed.v1.datetime.KotlinLocalDateTimeColumnType
import org.jetbrains.exposed.v1.datetime.dateTimeParam
import org.jetbrains.exposed.v1.jdbc.JdbcTransaction
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insert
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
import java.sql.ResultSet
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant

private val log = KotlinLogging.logger { }

/** candidates fetched per entry still to claim: concurrent pollers skip the candidates that others hold */
private const val CLAIM_CANDIDATE_FACTOR = 10

/** caps the over-fetch of large (manual) claims */
private const val MAX_EXTRA_CLAIM_CANDIDATES = 10_000

private const val MAX_CLAIM_ROUNDS = 5

private data class ClaimCursor(val after: AccessionVersion?, val lastFullScan: Instant)

private val accessionVersionOrder = compareBy<AccessionVersion>({ it.accession }, { it.version })

internal fun claimCandidateLimit(remaining: Int) =
    minOf(remaining.toLong() * CLAIM_CANDIDATE_FACTOR, remaining.toLong() + MAX_EXTRA_CLAIM_CANDIDATES).toInt()

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
    @Value("\${${BackendSpringProperty.CLAIM_FULL_SCAN_INTERVAL_SECONDS}:10}") claimFullScanIntervalSeconds: Long,
) {
    private val claimFullScanInterval = claimFullScanIntervalSeconds.seconds
    private val claimCursors = ConcurrentHashMap<Pair<String, Long>, ClaimCursor>()

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

    private fun fetchUnprocessedEntriesAndUpdateToInProcessing(
        organism: Organism,
        numberOfSequenceEntries: Int,
        pipelineVersion: Long,
    ): Sequence<UnprocessedData> {
        val claimedKeys = claimUnprocessedEntries(organism, numberOfSequenceEntries, pipelineVersion)
        val table = SequenceEntriesTable

        return claimedKeys
            .asSequence()
            .chunked(streamBatchSize)
            .flatMap { chunk ->
                table
                    .select(
                        table.accessionColumn,
                        table.versionColumn,
                        table.submittedDataColumn,
                        table.submissionIdColumn,
                        table.submitterColumn,
                        table.groupIdColumn,
                        table.submittedAtTimestampColumn,
                    )
                    .where { table.accessionVersionIsIn(chunk) }
                    .orderBy(table.accessionColumn to SortOrder.ASC, table.versionColumn to SortOrder.ASC)
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
                            data = submittedDataWithFileUrls,
                            submissionId = it[table.submissionIdColumn],
                            submitter = it[table.submitterColumn],
                            groupId = it[table.groupIdColumn],
                            submittedAt = it[table.submittedAtTimestampColumn].toTimestamp(),
                        )
                    }
            }
    }

    /**
     * Claims up to [limit] unprocessed, non-revocation entries of [organism] for [pipelineVersion] by inserting their
     * IN_PROCESSING rows, and returns the claimed keys in (accession, version) order.
     *
     * Each round runs two statements, each with its own READ COMMITTED snapshot:
     * 1. [findClaimCandidates]: the first [claimCandidateLimit] unprocessed keys, an index only scan without locks.
     *    It over-fetches, because concurrent pollers compute nearly the same candidates.
     * 2. [lockAndInsertClaims]: locks up to the remaining number of candidates with SKIP LOCKED, re-checks that they
     *    are still unprocessed (claims committed while step 1 ran are visible to this new snapshot) and inserts
     *    their rows; only the keys the INSERT returns are claimed.
     * The primary key of the preprocessed data table guarantees that no entry is handed out twice; the row lock only
     * keeps concurrent pollers apart without waiting. Later rounds continue after the last candidate of the previous
     * round: candidates that were skipped are held by in-flight claims.
     *
     * A scan from the start walks every processed entry before the first unprocessed one, and new entries sort last
     * (SARS-CoV-2 at 1.9M entries: 3.3 s per claim, 83 % of the database's time). So a claim starts after the last
     * entry claimed so far (the cursor), which finds the new entries in milliseconds, and scans from the start at most
     * once per [claimFullScanInterval] per organism and pipeline version, for entries that appear before the cursor:
     * revisions, claims reset as stale and claims that rolled back. Until a claim sets the cursor, claims between
     * full scans return nothing, so an organism with nothing to process costs one full scan per interval.
     */
    private fun claimUnprocessedEntries(
        organism: Organism,
        limit: Int,
        pipelineVersion: Long,
    ): List<AccessionVersion> {
        val key = organism.name to pipelineVersion
        val now = dateProvider.getCurrentInstant()
        var fullScan = false
        val cursor = claimCursors.compute(key) { _, current ->
            if (current == null || now - current.lastFullScan >= claimFullScanInterval) {
                fullScan = true
                ClaimCursor(current?.after, now)
            } else {
                current
            }
        }!!
        if (!fullScan && cursor.after == null) {
            // Nothing claimed since the last full scan found nothing: wait for the next one instead of repeating it.
            return emptyList()
        }
        val claimed = mutableListOf<AccessionVersion>()
        var after: AccessionVersion? = if (fullScan) null else cursor.after
        var round = 0
        while (claimed.size < limit && round < MAX_CLAIM_ROUNDS) {
            round++
            val remaining = limit - claimed.size
            val candidateLimit = claimCandidateLimit(remaining)
            val candidates = findClaimCandidates(organism, pipelineVersion, candidateLimit, after)
            if (candidates.isEmpty()) {
                break
            }
            claimed += lockAndInsertClaims(candidates, remaining, pipelineVersion)
            if (candidates.size < candidateLimit) {
                break
            }
            after = candidates.last()
        }
        val sorted = claimed.sortedWith(accessionVersionOrder)
        sorted.lastOrNull()?.let { last ->
            claimCursors.computeIfPresent(key) { _, current ->
                // Concurrent claims finish out of order; only a full scan moves the cursor back.
                val after = if (fullScan) last else maxOf(current.after ?: last, last, accessionVersionOrder)
                current.copy(after = after)
            }
        }
        log.info {
            "Claimed ${claimed.size} of up to $limit entries for processing in $round round(s)" +
                if (fullScan) " from the start" else " after ${cursor.after}"
        }
        return sorted
    }

    private fun findClaimCandidates(
        organism: Organism,
        pipelineVersion: Long,
        candidateLimit: Int,
        after: AccessionVersion?,
    ): List<AccessionVersion> {
        // The limit is inlined so that a generic plan of the prepared statement still sees it.
        val sql = """
            SELECT se.accession, se.version
            FROM $SEQUENCE_ENTRIES_TABLE_NAME se
            WHERE se.organism = ?
              AND NOT se.is_revocation
              ${if (after != null) "AND (se.accession, se.version) > (?, ?)" else ""}
              AND NOT EXISTS (
                  SELECT FROM $SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME p
                  WHERE p.accession = se.accession AND p.version = se.version AND p.pipeline_version = ?
                  -- implied by the join, but lets a merge anti join start both sides at the cursor
                  ${if (after != null) "AND (p.accession, p.version) > (?, ?)" else ""}
              )
            ORDER BY se.accession, se.version
            LIMIT $candidateLimit
        """.trimIndent()
        val args = buildList {
            add(TextColumnType() to organism.name)
            if (after != null) {
                add(TextColumnType() to after.accession)
                add(LongColumnType() to after.version)
            }
            add(LongColumnType() to pipelineVersion)
            if (after != null) {
                add(TextColumnType() to after.accession)
                add(LongColumnType() to after.version)
            }
        }
        return TransactionManager.current().exec(sql, args, explicitStatementType = StatementType.SELECT) {
            readAccessionVersions(it)
        }.orEmpty()
    }

    private fun lockAndInsertClaims(
        candidates: List<AccessionVersion>,
        limit: Int,
        pipelineVersion: Long,
    ): List<AccessionVersion> {
        // One statement per round, so the per statement tracker trigger fires once per round rather than once per
        // claimed entry.
        val sql = """
            WITH locked AS (
                SELECT se.accession, se.version
                FROM $SEQUENCE_ENTRIES_TABLE_NAME se
                JOIN unnest(?::text[], ?::bigint[]) AS candidate(accession, version)
                  ON se.accession = candidate.accession AND se.version = candidate.version
                WHERE NOT EXISTS (
                    SELECT FROM $SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME p
                    WHERE p.accession = se.accession AND p.version = se.version AND p.pipeline_version = ?
                )
                ORDER BY se.accession, se.version
                LIMIT $limit
                FOR UPDATE OF se SKIP LOCKED
            )
            INSERT INTO $SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME (
                accession,
                version,
                pipeline_version,
                processing_status,
                started_processing_at
            )
            SELECT accession, version, ?::bigint, '${IN_PROCESSING.name}', ?::timestamp
            FROM locked
            ON CONFLICT (accession, version, pipeline_version) DO NOTHING
            RETURNING accession, version
        """.trimIndent()

        return TransactionManager.current().exec(
            sql,
            args = listOf(
                ArrayColumnType<String, List<String>>(TextColumnType()) to candidates.map { it.accession },
                ArrayColumnType<Long, List<Long>>(LongColumnType()) to candidates.map { it.version },
                LongColumnType() to pipelineVersion,
                LongColumnType() to pipelineVersion,
                KotlinLocalDateTimeColumnType() to dateProvider.getCurrentDateTime(),
            ),
            // SELECT so that Exposed runs executeQuery and the RETURNING rows can be read.
            explicitStatementType = StatementType.SELECT,
        ) { readAccessionVersions(it) }.orEmpty()
    }

    private fun readAccessionVersions(resultSet: ResultSet): List<AccessionVersion> = buildList {
        while (resultSet.next()) {
            add(AccessionVersion(resultSet.getString("accession"), resultSet.getLong("version")))
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
                storeProcessedResults(storedResults, pipelineVersion)

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
     * batch, and it keeps deriving the organism from sequence_entries itself.
     */
    private fun storeProcessedResults(storedResults: List<StoredProcessedResult>, pipelineVersion: Long) {
        if (storedResults.isEmpty()) {
            return
        }

        val sql = """
            UPDATE $SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME AS preprocessed
            SET processing_status = '${PROCESSED.name}',
                processed_data = submitted.processed_data::jsonb,
                errors = submitted.errors::jsonb,
                warnings = submitted.warnings::jsonb,
                finished_processing_at = ?::timestamp
            FROM unnest(?::text[], ?::bigint[], ?::text[], ?::text[], ?::text[])
                AS submitted(accession, version, processed_data, errors, warnings)
            WHERE preprocessed.accession = submitted.accession
              AND preprocessed.version = submitted.version
              AND preprocessed.pipeline_version = ?::bigint
              AND preprocessed.processing_status = '${IN_PROCESSING.name}'
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
                textArrayColumnType to storedResults.map { serialize(it.processedData) },
                textArrayColumnType to storedResults.map { serialize(it.errors) },
                textArrayColumnType to storedResults.map { serialize(it.warnings) },
                LongColumnType() to pipelineVersion,
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
            throwInsertFailedException(failedResult.submitted, pipelineVersion)
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

        // every PROCESSED entry is unreleased: the released_at predicate lets sequence_entries_unreleased_idx drive
        // the plan, so the cost follows the unreleased backlog instead of the organism's whole table
        val statusCondition = SequenceEntriesView.statusIs(Status.PROCESSED) and
            SequenceEntriesView.releasedAtTimestampColumn.isNull()

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

    /** @param accessions if given, only consider these accessions */
    fun getLatestVersions(organism: Organism, accessions: Collection<Accession>? = null): Map<Accession, Version> {
        val startTime = dateProvider.getCurrentInstant()
        val maxVersionExpression = SequenceEntriesView.versionColumn.max()
        val result = SequenceEntriesView
            .select(SequenceEntriesView.accessionColumn, maxVersionExpression)
            .where {
                SequenceEntriesView.statusIs(Status.APPROVED_FOR_RELEASE) and SequenceEntriesView.organismIs(
                    organism,
                ) and accessionFilter(accessions)
            }
            .groupBy(SequenceEntriesView.accessionColumn)
            .associate { it[SequenceEntriesView.accessionColumn] to it[maxVersionExpression]!! }
        log.info { "Getting latest versions for $organism took ${durationTillNowInMs(startTime)} ms" }
        return result
    }

    /** @param accessions if given, only consider these accessions */
    fun getLatestRevocationVersions(
        organism: Organism,
        accessions: Collection<Accession>? = null,
    ): Map<Accession, Version> {
        val startTime = dateProvider.getCurrentInstant()
        val maxVersionExpression = SequenceEntriesView.versionColumn.max()

        val result = SequenceEntriesView.select(SequenceEntriesView.accessionColumn, maxVersionExpression)
            .where {
                SequenceEntriesView.statusIs(Status.APPROVED_FOR_RELEASE) and
                    (SequenceEntriesView.isRevocationColumn eq true) and
                    SequenceEntriesView.organismIs(organism) and
                    accessionFilter(accessions)
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
    fun streamReleasedSubmissions(organism: Organism): Sequence<RawProcessedData> =
        releasedSubmissionsQuery(SequenceEntriesView, organism, accessions = null)
            .map { row ->
                toRawProcessedData(
                    SequenceEntriesView,
                    row,
                    when (val processedData = row[SequenceEntriesView.jointDataColumn]) {
                        null -> emptyProcessedDataProvider.provide(organism)
                        else -> processedDataPostprocessor.retrieveFromStoredValue(processedData, organism)
                    },
                )
            }

    /**
     * Like [streamReleasedSubmissions] (same rows, same order, same metadata), but without decompressing the
     * sequences: [RawProcessedData.processedData] of the returned entries has no sequences, the (still compressed)
     * sequences and insertions are returned as second element, filtered to the sequences of the reference genome.
     *
     * @param accessions if given, only entries of these accessions are returned
     */
    fun streamReleasedSubmissionsWithCompressedSequences(
        organism: Organism,
        accessions: Collection<Accession>? = null,
    ): Sequence<Pair<RawProcessedData, ProcessedData<CompressedSequence>>> {
        // same rows; the lateral view does not aggregate all of external_metadata for an accession filter
        val view = if (accessions == null) SequenceEntriesView else SequenceEntriesLateralView
        return releasedSubmissionsQuery(view, organism, accessions)
            .map { row ->
                val compressed = when (val processedData = row[view.jointDataColumn]) {
                    null -> emptyProcessedDataProvider.provideCompressed(organism)

                    else -> processedDataPostprocessor.retrieveFromStoredValueWithoutDecompressing(
                        processedData,
                        organism,
                    )
                }
                val withoutSequences = ProcessedData<GeneticSequence>(
                    metadata = compressed.metadata,
                    unalignedNucleotideSequences = emptyMap(),
                    alignedNucleotideSequences = emptyMap(),
                    nucleotideInsertions = compressed.nucleotideInsertions,
                    alignedAminoAcidSequences = emptyMap(),
                    aminoAcidInsertions = compressed.aminoAcidInsertions,
                    sequenceNameToFastaId = compressed.sequenceNameToFastaId,
                    files = compressed.files,
                )
                toRawProcessedData(view, row, withoutSequences) to compressed
            }
    }

    private fun accessionFilter(
        accessions: Collection<Accession>?,
        view: SequenceEntriesViewTable = SequenceEntriesView,
    ): Op<Boolean> = when (accessions) {
        null -> Op.TRUE
        else -> view.accessionColumn inList accessions
    }

    private fun releasedSubmissionsQuery(
        view: SequenceEntriesViewTable,
        organism: Organism,
        accessions: Collection<Accession>?,
    ) = view.join(
        DataUseTermsTable,
        JoinType.LEFT,
        additionalConstraint = {
            (view.accessionColumn eq DataUseTermsTable.accessionColumn) and
                (DataUseTermsTable.isNewestDataUseTerms)
        },
    )
        .select(
            view.accessionColumn,
            view.versionColumn,
            view.isRevocationColumn,
            view.jointDataColumn,
            view.submitterColumn,
            view.groupIdColumn,
            view.submittedAtTimestampColumn,
            view.releasedAtTimestampColumn,
            view.submissionIdColumn,
            view.pipelineVersionColumn,
            DataUseTermsTable.dataUseTermsTypeColumn,
            DataUseTermsTable.restrictedUntilColumn,
            DataUseTermsTable.changeDateColumn,
        )
        .where {
            view.statusIs(Status.APPROVED_FOR_RELEASE) and view.organismIs(
                organism,
            ) and accessionFilter(accessions, view)
        }
        .orderBy(
            view.accessionColumn to SortOrder.ASC,
            view.versionColumn to SortOrder.ASC,
        )
        .fetchSize(streamBatchSize)
        .asSequence()

    private fun toRawProcessedData(
        view: SequenceEntriesViewTable,
        row: ResultRow,
        processedData: ProcessedData<GeneticSequence>,
    ) = RawProcessedData(
        accession = row[view.accessionColumn],
        version = row[view.versionColumn],
        isRevocation = row[view.isRevocationColumn],
        submitter = row[view.submitterColumn],
        groupId = row[view.groupIdColumn],
        groupName = GroupEntity[row[view.groupIdColumn]].groupName,
        submissionId = row[view.submissionIdColumn],
        processedData = processedData,
        pipelineVersion = row[view.pipelineVersionColumn]!!,
        submittedAtTimestamp = row[view.submittedAtTimestampColumn],
        releasedAtTimestamp = row[view.releasedAtTimestampColumn]!!,
        dataUseTerms = DataUseTerms.fromParameters(
            DataUseTermsType.fromString(row[DataUseTermsTable.dataUseTermsTypeColumn]),
            row[DataUseTermsTable.restrictedUntilColumn],
        ),
        dataUseTermsChangeDate = row[DataUseTermsTable.changeDateColumn],
    )

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
        val status = SequenceEntriesView.statusWithoutJoin.alias("status")

        return SequenceEntriesView
            .select(
                submittedMetadata,
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.submitterColumn,
                SequenceEntriesView.isRevocationColumn,
                status,
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
                    Status.fromString(it[status]),
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

private fun JdbcTransaction.findNewPreprocessingPipelineVersion(organism: String): Long? {
    // Maybe we want to refactor this function: https://github.com/loculus-project/loculus/issues/3571

    // This query goes into the processed data and finds _any_ processed data that was processed
    // with a pipeline version greater than the current one.
    // If such a version is found ('newer.pipeline_version'), we go in and check some stuff.
    // We look at all the data that was processed successfully with the current pipeline version,
    // and then we check whether all of these were also successfully processed with the newer version.
    // If any accession.version either was processed unsuccessfully with the new version, or just wasn't
    // processed yet -> we _don't_ return the new version yet.

    // The current version is inlined as a literal: with a subquery (or a generic plan for a parameter) the planner
    // cannot see that only a few rows have a newer version, and hash-joins a sequential scan of all of the
    // organism's sequence entries (~1 s for 2M SARS-CoV-2 entries, every 10 s); with the literal it probes the
    // pipeline_version index and the sequence_entries primary key (~70 ms).
    val currentVersion = exec(
        "select version from current_processing_pipeline where organism = ?",
        listOf(Pair(VarCharColumnType(), organism)),
        explicitStatementType = StatementType.SELECT,
    ) { resultSet -> if (resultSet.next()) resultSet.getLong("version") else null } ?: return null

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
                            and sep.pipeline_version > $currentVersion
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
                                    and sep.pipeline_version = $currentVersion
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
