package org.loculus.backend.service.submission

import org.jetbrains.exposed.sql.Table

const val SEQUENCE_ENTRIES_PREPROCESSED_DATA_FILE_TABLE_NAME = "sequence_entries_preprocessed_data_file"

object SequenceEntriesPreprocessedDataFileTable : Table(SEQUENCE_ENTRIES_PREPROCESSED_DATA_FILE_TABLE_NAME) {
    val accessionColumn = varchar("accession", 255)
    val versionColumn = long("version")
    val pipelineVersionColumn = long("pipeline_version")
    val fileIdColumn = text("file_id")
    val fileNameColumn = text("file_name")

    override val primaryKey = PrimaryKey(accessionColumn, versionColumn, pipelineVersionColumn, fileColumn)
}
