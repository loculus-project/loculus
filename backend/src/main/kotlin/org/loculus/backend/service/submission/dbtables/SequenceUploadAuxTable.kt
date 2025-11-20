package org.loculus.backend.service.submission

import org.jetbrains.exposed.sql.Table
import org.loculus.backend.service.jacksonSerializableJsonb

const val SEQUENCE_UPLOAD_AUX_TABLE_NAME = "sequence_upload_aux_table"

object SequenceUploadAuxTable : Table(SEQUENCE_UPLOAD_AUX_TABLE_NAME) {
    val sequenceUploadIdColumn = varchar("upload_id", 255)
    val fastaIdColumn = varchar("fasta_id", 255)
    val compressedSequenceDataColumn = jacksonSerializableJsonb<CompressedSequence>("compressed_sequence_data")

    override val primaryKey = PrimaryKey(sequenceUploadIdColumn, fastaIdColumn)
}
