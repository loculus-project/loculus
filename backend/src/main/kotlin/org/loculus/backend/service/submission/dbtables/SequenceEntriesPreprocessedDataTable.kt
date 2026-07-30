package org.loculus.backend.service.submission

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.java.javaUUID
import org.jetbrains.exposed.v1.datetime.datetime
import org.loculus.backend.service.jacksonSerializableJsonb
import org.loculus.backend.types.AccessionVersionInterface
import org.loculus.backend.types.PreprocessingAnnotation
import org.loculus.backend.types.PreprocessingStatus
import org.loculus.backend.types.ProcessedData

const val SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME = "sequence_entries_preprocessed_data"

object SequenceEntriesPreprocessedDataTable : Table(SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME) {
    val accessionColumn = varchar("accession", 255)
    val versionColumn = long("version")
    val pipelineVersionColumn = long("pipeline_version")
    val organismColumn = varchar("organism", 255) // Copied from sequence_entries by the enqueue trigger
    val processedDataColumn =
        jacksonSerializableJsonb<ProcessedData<CompressedSequence>>("processed_data").nullable()
    val errorsColumn = jacksonSerializableJsonb<List<PreprocessingAnnotation>>("errors").nullable()
    val warningsColumn = jacksonSerializableJsonb<List<PreprocessingAnnotation>>("warnings").nullable()
    val processingStatusColumn = varchar("processing_status", 255)
    val processingAttemptIdColumn = javaUUID("processing_attempt_id").nullable() // Set only while IN_PROCESSING
    val leaseUntilColumn = datetime("lease_until").nullable()
    val startedProcessingAtColumn = datetime("started_processing_at").nullable()
    val finishedProcessingAtColumn = datetime("finished_processing_at").nullable()

    override val primaryKey = PrimaryKey(accessionColumn, versionColumn, pipelineVersionColumn)

    fun accessionVersionEquals(accessionVersion: AccessionVersionInterface) =
        (accessionColumn eq accessionVersion.accession) and
            (versionColumn eq accessionVersion.version)

    fun statusIs(status: PreprocessingStatus) = processingStatusColumn eq status.name
}
