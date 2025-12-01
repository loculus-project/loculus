package org.loculus.backend.service.submission

import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.PreprocessingAnnotation
import org.loculus.backend.api.PreprocessingStatus
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.service.jacksonSerializableJsonb

const val SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME = "sequence_entries_preprocessed_data"

object SequenceEntriesPreprocessedDataTable : Table(SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME) {
    val accessionColumn = varchar("accession", 255)
    val versionColumn = long("version")
    val pipelineVersionColumn = long("pipeline_version")
    val processedDataColumn =
        jacksonSerializableJsonb<ProcessedData<CompressedSequence>>("processed_data").nullable()
    val errorsColumn = jacksonSerializableJsonb<List<PreprocessingAnnotation>>("errors").nullable()
    val warningsColumn = jacksonSerializableJsonb<List<PreprocessingAnnotation>>("warnings").nullable()
    val processingStatusColumn = varchar("processing_status", 255)
    val startedProcessingAtColumn = datetime("started_processing_at").nullable()
    val finishedProcessingAtColumn = datetime("finished_processing_at").nullable()

    override val primaryKey = PrimaryKey(accessionColumn, versionColumn, pipelineVersionColumn)

    fun accessionVersionEquals(accessionVersion: AccessionVersionInterface) =
        (accessionColumn eq accessionVersion.accession) and
            (versionColumn eq accessionVersion.version)

    fun statusIs(status: PreprocessingStatus) = processingStatusColumn eq status.name
}
