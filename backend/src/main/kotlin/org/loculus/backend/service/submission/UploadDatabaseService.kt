package org.loculus.backend.service.submission

import kotlinx.datetime.LocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.sql.IntegerColumnType
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.VarCharColumnType
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.statements.StatementType
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.loculus.backend.api.Organism
import org.loculus.backend.api.Status
import org.loculus.backend.api.SubmissionIdMapping
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.model.SubmissionId
import org.loculus.backend.model.SubmissionParams
import org.loculus.backend.service.GenerateAccessionFromNumberService
import org.loculus.backend.service.datauseterms.DataUseTermsDatabaseService
import org.loculus.backend.service.submission.MetadataUploadAuxTable.accessionColumn
import org.loculus.backend.service.submission.MetadataUploadAuxTable.groupNameColumn
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
) {

    fun batchInsertMetadataInAuxTable(
        uploadId: String,
        authenticatedUser: AuthenticatedUser,
        groupName: String,
        submittedOrganism: Organism,
        uploadedMetadataBatch: List<MetadataEntry>,
        uploadedAt: LocalDateTime,
    ) {
        MetadataUploadAuxTable.batchInsert(uploadedMetadataBatch) {
            this[submitterColumn] = authenticatedUser.username
            this[groupNameColumn] = groupName
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
            .select { uploadIdColumn eq uploadId }
            .map { it[submissionIdColumn] },

        SequenceUploadAuxTable
            .select { sequenceUploadIdColumn eq uploadId }
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
                group_name,
                submitted_at,
                original_data
            )
            SELECT
                m.accession,
                m.version,
                m.organism,
                m.submission_id,
                m.submitter,
                m.group_name,
                m.uploaded_at,
                jsonb_build_object(
                    'metadata', m.metadata,
                    'unalignedNucleotideSequences', jsonb_object_agg(s.segment_name, s.compressed_sequence_data::jsonb)
                )
            FROM
                metadata_upload_aux_table m
            JOIN
                sequence_upload_aux_table s ON m.upload_id = s.upload_id AND m.submission_id = s.submission_id
            WHERE m.upload_id = ?
            GROUP BY
                m.upload_id,
                m.organism,
                m.submission_id,
                m.submitter,
                m.group_name,
                m.uploaded_at
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
                .slice(accessionColumn)
                .select { uploadIdColumn eq uploadId }
                .map { it[accessionColumn]!! }

        accessionPreconditionValidator.validateAccessions(
            authenticatedUser,
            accessions,
            listOf(Status.APPROVED_FOR_RELEASE),
            organism,
        )

        val updateSql = """
            UPDATE metadata_upload_aux_table m
            SET
                version = sequence_entries.version + 1,
                group_name = sequence_entries.group_name
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

    fun generateNewAccessionsForOriginalUpload(uploadId: String, organism: Organism) {
        val submissionIds =
            MetadataUploadAuxTable
                .slice(submissionIdColumn)
                .select { uploadIdColumn eq uploadId }
                .map { it[submissionIdColumn] }

        val nextAccessions = getNextSequenceNumbers(submissionIds.size).map {
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

    fun getNextSequenceNumbers(numberOfNewEntries: Int) = transaction {
        val nextValues = exec(
            "SELECT nextval('accession_sequence') FROM generate_series(1, ?)",
            listOf(
                Pair(IntegerColumnType(), numberOfNewEntries),
            ),
        ) { rs ->
            val result = mutableListOf<Long>()
            while (rs.next()) {
                result += rs.getLong(1)
            }
            result.toList()
        } ?: emptyList()

        if (nextValues.size != numberOfNewEntries) {
            throw IllegalStateException("Expected $numberOfNewEntries values, got ${nextValues.size}.")
        }
        nextValues
    }
}
