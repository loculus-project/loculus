package org.loculus.backend.service.submission

import kotlinx.datetime.LocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.VarCharColumnType
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.statements.StatementType
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.loculus.backend.api.Organism
import org.loculus.backend.api.Status
import org.loculus.backend.api.SubmissionIdMapping
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.model.SubmissionId
import org.loculus.backend.model.SubmissionParams
import org.loculus.backend.service.GenerateAccessionFromNumberService
import org.loculus.backend.service.datauseterms.DataUseTermsDatabaseService
import org.loculus.backend.service.submission.MetadataUploadAuxTable.accessionColumn
import org.loculus.backend.service.submission.MetadataUploadAuxTable.groupIdColumn
import org.loculus.backend.service.submission.MetadataUploadAuxTable.metadataColumn
import org.loculus.backend.service.submission.MetadataUploadAuxTable.organismColumn
import org.loculus.backend.service.submission.MetadataUploadAuxTable.submissionIdColumn
import org.loculus.backend.service.submission.MetadataUploadAuxTable.submitterColumn
import org.loculus.backend.service.submission.MetadataUploadAuxTable.uploadIdColumn
import org.loculus.backend.service.submission.MetadataUploadAuxTable.uploadedAtColumn
import org.loculus.backend.service.submission.SequenceUploadAuxTable.compressedSequenceDataColumn
import org.loculus.backend.service.submission.SequenceUploadAuxTable.segmentNameColumn
import org.loculus.backend.service.submission.SequenceUploadAuxTable.sequenceSubmissionIdColumn
import org.loculus.backend.service.submission.SequenceUploadAuxTable.sequenceUploadIdColumn
import org.loculus.backend.utils.FastaEntry
import org.loculus.backend.utils.MetadataEntry
import org.loculus.backend.utils.ParseFastaHeader
import org.loculus.backend.utils.RevisionEntry
import org.loculus.backend.utils.getNextSequenceNumbers
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

private val log = KotlinLogging.logger { }

@Service
@Transactional
class UploadDatabaseService(
    private val parseFastaHeader: ParseFastaHeader,
    private val compressor: CompressionService,
    private val accessionPreconditionValidator: AccessionPreconditionValidator,
    private val dataUseTermsDatabaseService: DataUseTermsDatabaseService,
    private val generateAccessionFromNumberService: GenerateAccessionFromNumberService,
    private val auditLogger: AuditLogger,
) {

    fun batchInsertMetadataInAuxTable(
        uploadId: String,
        authenticatedUser: AuthenticatedUser,
        groupId: Int,
        submittedOrganism: Organism,
        uploadedMetadataBatch: List<MetadataEntry>,
        uploadedAt: LocalDateTime,
    ) {
        MetadataUploadAuxTable.batchInsert(uploadedMetadataBatch) {
            this[submitterColumn] = authenticatedUser.username
            this[groupIdColumn] = groupId
            this[uploadedAtColumn] = uploadedAt
            this[submissionIdColumn] = it.submissionId
            this[metadataColumn] = it.metadata
            this[organismColumn] = submittedOrganism.name
            this[uploadIdColumn] = uploadId
        }
    }

    fun batchInsertRevisedMetadataInAuxTable(
        uploadId: String,
        authenticatedUser: AuthenticatedUser,
        submittedOrganism: Organism,
        uploadedRevisedMetadataBatch: List<RevisionEntry>,
        uploadedAt: LocalDateTime,
    ) {
        MetadataUploadAuxTable.batchInsert(uploadedRevisedMetadataBatch) {
            this[accessionColumn] = it.accession
            this[submitterColumn] = authenticatedUser.username
            this[uploadedAtColumn] = uploadedAt
            this[submissionIdColumn] = it.submissionId
            this[metadataColumn] = it.metadata
            this[organismColumn] = submittedOrganism.name
            this[uploadIdColumn] = uploadId
        }
    }

    fun batchInsertSequencesInAuxTable(
        uploadId: String,
        submittedOrganism: Organism,
        uploadedSequencesBatch: List<FastaEntry>,
    ) {
        SequenceUploadAuxTable.batchInsert(uploadedSequencesBatch) {
            val (submissionId, segmentName) = parseFastaHeader.parse(it.sampleName, submittedOrganism)
            this[sequenceSubmissionIdColumn] = submissionId
            this[segmentNameColumn] = segmentName
            this[sequenceUploadIdColumn] = uploadId
            this[compressedSequenceDataColumn] = compressor.compressNucleotideSequence(
                it.sequence,
                segmentName,
                submittedOrganism,
            )
        }
    }

    fun getUploadSubmissionIds(uploadId: String): Pair<List<SubmissionId>, List<SubmissionId>> = Pair(
        MetadataUploadAuxTable
            .selectAll()
            .where { uploadIdColumn eq uploadId }
            .map { it[submissionIdColumn] },

        SequenceUploadAuxTable
            .selectAll()
            .where { sequenceUploadIdColumn eq uploadId }
            .map {
                it[sequenceSubmissionIdColumn]
            },
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
                    'unalignedNucleotideSequences', 
                    jsonb_object_agg(
                        sequence_upload_aux_table.segment_name,
                        sequence_upload_aux_table.compressed_sequence_data::jsonb
                    )
                )
            FROM
                metadata_upload_aux_table
            JOIN
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
            dataUseTermsDatabaseService.setNewDataUseTerms(
                submissionParams.authenticatedUser,
                insertionResult.map { it.accession },
                submissionParams.dataUseTerms,
            )
        }

        auditLogger.log(
            submissionParams.authenticatedUser.username,
            "Submitted or revised ${insertionResult.size} sequences: " +
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

        accessionPreconditionValidator.validate {
            thatAccessionsExist(accessions)
                .andThatUserIsAllowedToEditSequenceEntries(authenticatedUser)
                .andThatSequenceEntriesAreInStates(listOf(Status.APPROVED_FOR_RELEASE))
                .andThatOrganismIs(organism)
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

    fun generateNewAccessionsForOriginalUpload(uploadId: String) {
        val submissionIds =
            MetadataUploadAuxTable
                .select(submissionIdColumn)
                .where { uploadIdColumn eq uploadId }
                .map { it[submissionIdColumn] }

        val nextAccessions = getNextSequenceNumbers("accession_sequence", submissionIds.size).map {
            generateAccessionFromNumberService.generateCustomId(it)
        }

        if (submissionIds.size != nextAccessions.size) {
            throw IllegalStateException(
                "Mismatched sizes: accessions=${submissionIds.size}, nextAccessions=${nextAccessions.size}",
            )
        }

        val submissionIdToAccessionMap = submissionIds.zip(nextAccessions)

        log.info {
            "Generated ${submissionIdToAccessionMap.size} new accessions for original upload with UploadId $uploadId:"
        }

        submissionIdToAccessionMap.forEach { (submissionId, accession) ->
            MetadataUploadAuxTable.update(
                where = {
                    (submissionIdColumn eq submissionId) and (uploadIdColumn eq uploadId)
                },
            ) {
                it[accessionColumn] = accession
                it[versionColumn] = 1
            }
        }
    }
}
