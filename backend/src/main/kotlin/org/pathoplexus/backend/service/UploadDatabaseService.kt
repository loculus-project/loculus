package org.pathoplexus.backend.service

import kotlinx.datetime.LocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.VarCharColumnType
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.statements.StatementType
import org.jetbrains.exposed.sql.transactions.transaction
import org.pathoplexus.backend.api.Organism
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.api.SubmissionIdMapping
import org.pathoplexus.backend.model.SubmissionId
import org.pathoplexus.backend.service.MetadataUploadAuxTable.metadataColumn
import org.pathoplexus.backend.service.MetadataUploadAuxTable.organismColumn
import org.pathoplexus.backend.service.MetadataUploadAuxTable.submissionIdColumn
import org.pathoplexus.backend.service.MetadataUploadAuxTable.submitterColumn
import org.pathoplexus.backend.service.MetadataUploadAuxTable.uploadIdColumn
import org.pathoplexus.backend.service.MetadataUploadAuxTable.uploadedAtColumn
import org.pathoplexus.backend.service.SequenceUploadAuxTable.compressedSequenceDataColumn
import org.pathoplexus.backend.service.SequenceUploadAuxTable.segmentNameColumn
import org.pathoplexus.backend.service.SequenceUploadAuxTable.sequenceSubmissionIdColumn
import org.pathoplexus.backend.service.SequenceUploadAuxTable.sequenceUploadIdColumn
import org.pathoplexus.backend.utils.FastaEntry
import org.pathoplexus.backend.utils.MetadataEntry
import org.pathoplexus.backend.utils.ParseFastaHeader
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

private val log = KotlinLogging.logger { }

@Service
@Transactional
class UploadDatabaseService(
    private val parseFastaHeader: ParseFastaHeader,
    private val compressor: CompressionService,
) {

    fun batchInsertMetadataInAuxTable(
        submitter: String,
        uploadId: String,
        submittedOrganism: Organism,
        uploadedMetadataBatch: List<MetadataEntry>,
        uploadedAt: LocalDateTime,
    ) {
        MetadataUploadAuxTable.batchInsert(uploadedMetadataBatch) {
            this[submitterColumn] = submitter
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
            val (submissionId, segmentName) = parseFastaHeader.parse(it.sampleName)
            this[sequenceSubmissionIdColumn] = submissionId
            this[segmentNameColumn] = segmentName
            this[sequenceUploadIdColumn] = uploadId
            // this can be handled better; creating named sequences in the first place; it is possible to de-compress when serializing. Issue now, segment name is not known.
            this[compressedSequenceDataColumn] = compressor.compressUnalignedNucleotideSequence(
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

    fun mapAndCopy(uploadId: String): List<SubmissionIdMapping> {
        log.debug { "mapping and copying sequences with UploadId $uploadId" }

        val sql =
            """
            INSERT INTO sequence_entries (
                accession,
                organism,
                submission_id,
                submitter,
                submitted_at,
                original_data,
                status
            )
            SELECT
                nextval('accession_sequence'),
                m.organism,
                m.submission_id,
                m.submitter,
                m.uploaded_at,
                jsonb_build_object(
                    'metadata', m.metadata,
                    'unalignedNucleotideSequences', jsonb_object_agg(s.segment_name, s.compressed_sequence_data)
                ),
                '${Status.RECEIVED.name}' 
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
                m.uploaded_at
            RETURNING accession, version, submission_id;
          """

        return transaction {
            exec(
                sql,
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
        }
    }

    fun deleteUploadData(uploadId: String) {
        log.debug { "deleting upload data with UploadId $uploadId" }

        MetadataUploadAuxTable.deleteWhere { uploadIdColumn eq uploadId }
        SequenceUploadAuxTable.deleteWhere { sequenceUploadIdColumn eq uploadId }
    }
}
