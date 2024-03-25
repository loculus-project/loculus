package org.loculus.backend.service.submission

import com.fasterxml.jackson.module.kotlin.readValue
import mu.KotlinLogging
import org.jetbrains.exposed.sql.Column
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.json.jsonb
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.ProcessingAnnotation
import org.loculus.backend.api.ProcessingStatus
import org.loculus.backend.service.jacksonObjectMapper
import org.loculus.backend.service.jacksonSerializableJsonb
import org.springframework.stereotype.Service

private val logger = KotlinLogging.logger { }

@Service
class SequenceEntriesProcessedDataTableProvider(private val compressionService: CompressionService) {

    private val cachedTables: MutableMap<Organism?, SequenceEntriesProcessedDataTable> = mutableMapOf()

    fun get(organism: Organism?): SequenceEntriesProcessedDataTable {
        return cachedTables.getOrPut(organism) {
            SequenceEntriesProcessedDataTable(compressionService, organism)
        }
    }
}

const val SEQUENCE_ENTRIES_PROCESSED_DATA_TABLE_NAME = "sequence_entries_processed_data"

class SequenceEntriesProcessedDataTable(
    compressionService: CompressionService,
    organism: Organism? = null,
) : Table(
    SEQUENCE_ENTRIES_PROCESSED_DATA_TABLE_NAME,
) {
    val accessionColumn = varchar("accession", 255)
    val versionColumn = long("version")
    val pipelineVersion = long("pipeline_version")
    val processedDataColumn = serializeProcessedData(compressionService, organism).nullable()
    val errorsColumn = jacksonSerializableJsonb<List<ProcessingAnnotation>>("errors").nullable()
    val warningsColumn = jacksonSerializableJsonb<List<ProcessingAnnotation>>("warnings").nullable()
    val processingStatusColumn = varchar("processing_status", 255)
    val startedProcessingAtColumn = datetime("started_processing_at").nullable()
    val finishedProcessingAtColumn = datetime("finished_processing_at").nullable()

    override val primaryKey = PrimaryKey(accessionColumn, versionColumn, pipelineVersion)

    fun accessionVersionEquals(accessionVersion: AccessionVersionInterface) =
        (accessionColumn eq accessionVersion.accession) and
            (versionColumn eq accessionVersion.version)

    fun statusIs(status: ProcessingStatus) = processingStatusColumn eq status.name

    private val warningWhenNoOrganismWhenSerializing = "Organism is null when de-serializing data. " +
        "This should not happen. " +
        "Please check your code. " +
        "Data will be written without compression. " +
        "If this is unintentional data can become corrupted. "

    private fun serializeProcessedData(
        compressionService: CompressionService,
        organism: Organism?,
    ): Column<ProcessedData> {
        return jsonb(
            "processed_data",
            { processedData ->
                jacksonObjectMapper.writeValueAsString(
                    if (organism == null) {
                        logger.warn { warningWhenNoOrganismWhenSerializing }
                        processedData
                    } else {
                        compressionService.compressSequencesInProcessedData(
                            processedData,
                            organism,
                        )
                    },
                )
            },
            { string ->
                val processedData = jacksonObjectMapper.readValue(string) as ProcessedData
                if (organism == null) {
                    logger.warn { warningWhenNoOrganismWhenSerializing }
                    processedData
                } else {
                    compressionService.decompressSequencesInProcessedData(
                        jacksonObjectMapper.readValue(string) as ProcessedData,
                        organism,
                    )
                }
            },
        )
    }
}
