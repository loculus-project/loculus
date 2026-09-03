package org.loculus.backend.service.submission

import org.jetbrains.exposed.v1.core.Table
import org.loculus.backend.service.jacksonSerializableJsonb

const val SEQUENCE_UPLOAD_AUX_TABLE_NAME = "sequence_upload_aux_table"

object SequenceUploadAuxTable : Table(SEQUENCE_UPLOAD_AUX_TABLE_NAME) {
    val sequenceUploadIdColumn = text("upload_id")
    val fastaIdColumn = text("fasta_id")
    val compressedSequenceDataColumn = jacksonSerializableJsonb<CompressedSequence>("compressed_sequence_data")

    override val primaryKey = PrimaryKey(sequenceUploadIdColumn, fastaIdColumn)
}
