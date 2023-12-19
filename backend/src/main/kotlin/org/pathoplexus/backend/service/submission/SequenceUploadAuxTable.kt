package org.pathoplexus.backend.service.submission

import org.jetbrains.exposed.sql.Table

const val SEQUENCE_UPLOAD_TABLE_NAME = "sequence_upload_aux_table"

object SequenceUploadAuxTable : Table(SEQUENCE_UPLOAD_TABLE_NAME) {
    val sequenceUploadIdColumn = varchar("upload_id", 255)
    val sequenceSubmissionIdColumn = varchar("submission_id", 255)
    val segmentNameColumn = varchar("segment_name", 255)
    val compressedSequenceDataColumn = text("compressed_sequence_data")

    override val primaryKey = PrimaryKey(sequenceUploadIdColumn, sequenceSubmissionIdColumn, segmentNameColumn)
}
