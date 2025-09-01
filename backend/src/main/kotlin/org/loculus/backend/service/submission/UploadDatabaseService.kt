package org.loculus.backend.service.submission

import kotlinx.datetime.LocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.VarCharColumnType
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.statements.StatementType
import org.jetbrains.exposed.sql.transactions.transaction
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalData
import org.loculus.backend.api.Status
import org.loculus.backend.api.SubmissionIdFilesMap
import org.loculus.backend.api.SubmissionIdMapping
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.model.SegmentName
import org.loculus.backend.model.SubmissionId
import org.loculus.backend.model.SubmissionParams
import org.loculus.backend.service.GenerateAccessionFromNumberService
import org.loculus.backend.service.datauseterms.DataUseTermsDatabaseService
import org.loculus.backend.service.submission.SequenceEntriesTable.versionColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.versionCommentColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.accessionColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.organismColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.submissionIdColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.submitterColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.approverColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.groupIdColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.submittedAtTimestampColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.releasedAtTimestampColumn
import org.loculus.backend.service.submission.SequenceEntriesTable.originalDataColumn
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.DatabaseConstants
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.FastaEntry
import org.loculus.backend.utils.MetadataEntry
import org.loculus.backend.utils.ParseFastaHeader
import org.loculus.backend.utils.RevisionEntry
import org.loculus.backend.utils.chunkedForDatabase
import org.loculus.backend.utils.getNextSequenceNumbers
import org.loculus.backend.utils.processInDatabaseSafeChunks
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

private val log = KotlinLogging.logger { }

private const val SEQUENCE_INSERT_COLUMNS = 4
private const val METADATA_INSERT_COLUMNS = 8
private const val SEQUENCE_ENTRIES_INSERT_COLUMNS = 10
private const val SEQUENCE_BATCH_SIZE = DatabaseConstants.POSTGRESQL_PARAMETER_LIMIT / SEQUENCE_INSERT_COLUMNS
private const val METADATA_BATCH_SIZE = DatabaseConstants.POSTGRESQL_PARAMETER_LIMIT / METADATA_INSERT_COLUMNS
private const val SEQUENCE_ENTRIES_BATCH_SIZE = DatabaseConstants.POSTGRESQL_PARAMETER_LIMIT / SEQUENCE_ENTRIES_INSERT_COLUMNS

@Service
@Transactional
class UploadDatabaseService(
    private val parseFastaHeader: ParseFastaHeader,
    private val compressor: CompressionService,
    private val accessionPreconditionValidator: AccessionPreconditionValidator,
    private val dataUseTermsDatabaseService: DataUseTermsDatabaseService,
    private val generateAccessionFromNumberService: GenerateAccessionFromNumberService,
    private val auditLogger: AuditLogger,
    private val dateProvider: DateProvider,
) {

    fun batchInsertMetadataInAuxTable(
        uploadId: String,
        authenticatedUser: AuthenticatedUser,
        groupId: Int,
        submittedOrganism: Organism,
        uploadedMetadataBatch: List<MetadataEntry>,
        uploadedAt: LocalDateTime,
        files: SubmissionIdFilesMap?,
    ) {
        uploadedMetadataBatch.chunked(METADATA_BATCH_SIZE).forEach { batch ->
            MetadataUploadAuxTable.batchInsert(batch) {
                this[submitterColumn] = authenticatedUser.username
                this[groupIdColumn] = groupId
                this[uploadedAtColumn] = uploadedAt
                this[submissionIdColumn] = it.submissionId
                this[metadataColumn] = it.metadata
                this[filesColumn] = files?.get(it.submissionId)
                this[organismColumn] = submittedOrganism.name
                this[uploadIdColumn] = uploadId
            }
        }
    }

    fun batchInsertRevisedMetadataInAuxTable(
        uploadId: String,
        authenticatedUser: AuthenticatedUser,
        submittedOrganism: Organism,
        uploadedRevisedMetadataBatch: List<RevisionEntry>,
        uploadedAt: LocalDateTime,
        files: SubmissionIdFilesMap?,
    ) {
        uploadedRevisedMetadataBatch.chunked(METADATA_BATCH_SIZE).forEach { batch ->
            MetadataUploadAuxTable.batchInsert(batch) {
                this[accessionColumn] = it.accession
                this[submitterColumn] = authenticatedUser.username
                this[uploadedAtColumn] = uploadedAt
                this[submissionIdColumn] = it.submissionId
                this[metadataColumn] = it.metadata
                this[filesColumn] = files?.get(it.submissionId)
                this[organismColumn] = submittedOrganism.name
                this[uploadIdColumn] = uploadId
            }
        }
    }


    data class SequenceEntry(
        val accession: Accession,
        val version: Long,
        val versionComment: String?,
        val organism: Organism,
        val submissionId: SubmissionId,
        val submitter: String,
        val approver: String?,
        val groupId: Int,
        val submittedAtTimestamp: LocalDateTime,
        val releasedAtTimestamp: LocalDateTime?,
        val originalData: OriginalData<CompressedSequence>,
    )

    fun createNewSequenceEntries(
        metadata: Map<String, MetadataEntry>,
        sequences: Map<String, Map<SegmentName, String>>,
        files: Map<String, Map<String, List<FileIdAndName>>>,
        submissionParams: SubmissionParams.OriginalSubmissionParams,
    ): List<SubmissionIdMapping> {

        log.debug { "Creating new sequence entries" }

        val now = dateProvider.getCurrentDateTime()

        val newAccessions = generateNewAccessions(metadata.keys)

        val newEntries = newAccessions.map { (submissionId, accession) ->
            SequenceEntry(
                accession = accession,
                version = 1,
                versionComment = null,
                organism = submissionParams.organism,
                submissionId = submissionId,
                submitter = submissionParams.authenticatedUser.username,
                approver = null,
                groupId = submissionParams.groupId,
                submittedAtTimestamp = now,
                releasedAtTimestamp = null,
                originalData = OriginalData(
                    metadata = metadata[submissionId]?.metadata ?: emptyMap(),
                    files = files[submissionId],
                    unalignedNucleotideSequences = sequences[submissionId]?.mapValues { (segmentName, sequence) ->
                        compressor.compressNucleotideSequence(
                            sequence,
                            segmentName,
                            submissionParams.organism,
                        )
                    } ?: emptyMap(),
                ),
            )
        }

        newEntries.chunkedForDatabase(
            { batch ->
                SequenceEntriesTable.batchInsert(batch) {
                    this[accessionColumn] = it.accession
                    this[versionColumn] = it.version
                    this[versionCommentColumn] = it.versionComment
                    this[organismColumn] = it.organism.name
                    this[submissionIdColumn] = it.submissionId
                    this[submitterColumn] = it.submitter
                    this[approverColumn] = it.approver
                    this[groupIdColumn] = it.groupId
                    this[submittedAtTimestampColumn] = it.submittedAtTimestamp
                    this[releasedAtTimestampColumn] = it.releasedAtTimestamp
                    this[originalDataColumn] = it.originalData
                }
                emptyList<Unit>()
            },
            SEQUENCE_ENTRIES_INSERT_COLUMNS
        )

        return newAccessions.map { (submissionId, accession) ->
            SubmissionIdMapping(
                accession = accession,
                version = 1,
                submissionId = submissionId,
            )
        }

    }

    fun createRevisionEntries(
        metadata: Map<String, MetadataEntry>,
        sequences: Map<String, Map<SegmentName, String>>,
        files: Map<String, Map<String, List<FileIdAndName>>>,
        submissionParams: SubmissionParams.RevisionSubmissionParams,
    ): List<SubmissionIdMapping> {

        log.debug { "Creating revision entries" }

        val now = dateProvider.getCurrentDateTime()

        val newEntries = metadata.values.map { entry ->
            val latestVersion = accessionPreconditionValidator.getLatestVersion(entry.accession)
            SequenceEntry(
                accession = entry.accession,
                version = latestVersion + 1,
                versionComment = submissionParams.versionComment,
                organism = submissionParams.organism,
                submissionId = entry.submissionId,
                submitter = submissionParams.authenticatedUser.username,
                approver = null,
                groupId = submissionParams.groupId,
                submittedAtTimestamp = now,
                releasedAtTimestamp = null,
                originalData = OriginalData(
                    metadata = entry.metadata,
                    files = files[entry.submissionId],
                    unalignedNucleotideSequences = sequences[entry.submissionId]?.mapValues { (segmentName, sequence) ->
                        compressor.compressNucleotideSequence(
                            sequence,
                            segmentName,
                            submissionParams.organism,
                        )
                    } ?: emptyMap(),
                ),
            )
        }

        newEntries.chunkedForDatabase(
            { batch ->
                SequenceEntriesTable.batchInsert(batch) {
                    this[accessionColumn] = it.accession
                    this[versionColumn] = it.version
                    this[versionCommentColumn] = it.versionComment
                    this[organismColumn] = it.organism.name
                    this[submissionIdColumn] = it.submissionId
                    this[submitterColumn] = it.submitter
                    this[approverColumn] = it.approver
                    this[groupIdColumn] = it.groupId
                    this[submittedAtTimestampColumn] = it.submittedAtTimestamp
                    this[releasedAtTimestampColumn] = it.releasedAtTimestamp
                    this[originalDataColumn] = it.originalData
                }
                emptyList<Unit>()
            },
            SEQUENCE_ENTRIES_INSERT_COLUMNS
        )

        return metadata.values.map { entry ->
            SubmissionIdMapping(
                accession = entry.accession,
                version = accessionPreconditionValidator.getLatestVersion(entry.accession),
                submissionId = entry.submissionId,
            )
        }
    }
    )

    fun mapAndCopy(uploadId: String, submissionParams: SubmissionParams): List<SubmissionIdMapping> = transaction {
        log.debug {
            "mapping and copying sequences with UploadId $uploadId and uploadType: $submissionParams.uploadType"
        }

        val mapAndCopySql = """
            INSERT INTO sequence_entries (
                accession,
                version,
                organism,
                submission_id,
                submitter,
                group_id,
                submitted_at,
                original_data
            )
            SELECT
                metadata_upload_aux_table.accession,
                metadata_upload_aux_table.version,
                metadata_upload_aux_table.organism,
                metadata_upload_aux_table.submission_id,
                metadata_upload_aux_table.submitter,
                metadata_upload_aux_table.group_id,
                metadata_upload_aux_table.uploaded_at,
                jsonb_build_object(
                    'metadata', metadata_upload_aux_table.metadata,
                    'files', metadata_upload_aux_table.files,
                    'unalignedNucleotideSequences', 
                    COALESCE(
                        jsonb_object_agg(
                            sequence_upload_aux_table.segment_name,
                            sequence_upload_aux_table.compressed_sequence_data::jsonb
                        ) FILTER (WHERE sequence_upload_aux_table.segment_name IS NOT NULL),
                        '{}'::jsonb
                    )
                )
            FROM
                metadata_upload_aux_table
            LEFT JOIN
                sequence_upload_aux_table
                ON metadata_upload_aux_table.upload_id = sequence_upload_aux_table.upload_id 
                AND metadata_upload_aux_table.submission_id = sequence_upload_aux_table.submission_id
            WHERE metadata_upload_aux_table.upload_id = ?
            GROUP BY
                metadata_upload_aux_table.upload_id,
                metadata_upload_aux_table.organism,
                metadata_upload_aux_table.submission_id,
                metadata_upload_aux_table.submitter,
                metadata_upload_aux_table.group_id,
                metadata_upload_aux_table.uploaded_at
            RETURNING accession, version, submission_id;
        """.trimIndent()
        val insertionResult = exec(
            mapAndCopySql,
            listOf(
                Pair(VarCharColumnType(), uploadId),
            ),
            explicitStatementType = StatementType.SELECT,
        ) { rs ->
            val result = mutableListOf<SubmissionIdMapping>()
            while (rs.next()) {
                result += SubmissionIdMapping(
                    rs.getString("accession"),
                    rs.getLong("version"),
                    rs.getString("submission_id"),
                )
            }
            result.toList()
        } ?: emptyList()

        if (submissionParams is SubmissionParams.OriginalSubmissionParams) {
            log.debug { "Setting data use terms for submission $uploadId to ${submissionParams.dataUseTerms}" }
            val accessions = insertionResult.map { it.accession }
            dataUseTermsDatabaseService.setNewDataUseTerms(
                submissionParams.authenticatedUser,
                accessions,
                submissionParams.dataUseTerms,
            )
        }

        auditLogger.log(
            username = submissionParams.authenticatedUser.username,
            description = "Submitted or revised ${insertionResult.size} sequences: " +
                    insertionResult.joinToString { it.displayAccessionVersion() },
        )

        return@transaction insertionResult
    }

    fun deleteUploadData(uploadId: String) {
        log.debug { "deleting upload data with UploadId $uploadId" }

        MetadataUploadAuxTable.deleteWhere { uploadIdColumn eq uploadId }
        SequenceUploadAuxTable.deleteWhere { sequenceUploadIdColumn eq uploadId }
    }

    fun associateRevisedDataWithExistingSequenceEntries(
        uploadId: String,
        organism: Organism,
        authenticatedUser: AuthenticatedUser,
    ) {
        val accessions =
            MetadataUploadAuxTable
                .select(accessionColumn)
                .where { uploadIdColumn eq uploadId }
                .map { it[accessionColumn]!! }

        accessions.processInDatabaseSafeChunks { chunk ->
            accessionPreconditionValidator.validate {
                thatAccessionsExist(chunk)
                    .andThatUserIsAllowedToEditSequenceEntries(authenticatedUser)
                    .andThatSequenceEntriesAreInStates(listOf(Status.APPROVED_FOR_RELEASE))
                    .andThatOrganismIs(organism)
            }
        }

        val updateSql = """
            UPDATE metadata_upload_aux_table m
            SET
                version = sequence_entries.version + 1,
                group_id = sequence_entries.group_id
            FROM sequence_entries
            WHERE
                m.upload_id = ?
                AND m.accession = sequence_entries.accession
                AND ${SequenceEntriesTable.isMaxVersion}
        """.trimIndent()
        transaction {
            exec(
                updateSql,
                listOf(
                    Pair(VarCharColumnType(), uploadId),
                ),
            )
        }
    }

    fun getSubmissionIdToGroupMapping(uploadId: String): Map<String, Int> = MetadataUploadAuxTable
        .select(submissionIdColumn, groupIdColumn)
        .where { uploadIdColumn eq uploadId }
        .associate { Pair(it[submissionIdColumn], it[groupIdColumn]!!) }

    // Returns a list of pairs (submissionId, accession)
    fun generateNewAccessions(submissionIds: Collection<String>): List<Pair<String, Accession>> {
        log.info { "Generating ${submissionIds.size} new accessions" }
        val nextAccessions = getNextSequenceNumbers("accession_sequence", submissionIds.size).map {
            generateAccessionFromNumberService.generateCustomId(it)
        }

        if (submissionIds.size != nextAccessions.size) {
            throw IllegalStateException(
                "Mismatched sizes: accessions=${submissionIds.size}, nextAccessions=${nextAccessions.size}",
            )
        }

        log.info { "Generated ${submissionIds.size} new accessions" }
        return submissionIds.zip(nextAccessions)
    }
}
