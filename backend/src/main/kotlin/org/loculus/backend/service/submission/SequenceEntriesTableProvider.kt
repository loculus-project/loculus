package org.loculus.backend.service.submission

import com.fasterxml.jackson.module.kotlin.readValue
import org.jetbrains.exposed.sql.Column
import org.jetbrains.exposed.sql.Expression
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.alias
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.json.jsonb
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.wrapAsExpression
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalData
import org.loculus.backend.api.PreprocessingAnnotation
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.Status
import org.loculus.backend.api.toPairs
import org.loculus.backend.service.jacksonObjectMapper
import org.loculus.backend.service.jacksonSerializableJsonb
import org.springframework.stereotype.Service

@Service
class SequenceEntriesTableProvider(private val compressionService: CompressionService) {

    private val cachedTables: MutableMap<Organism, SequenceEntriesDataTable> = mutableMapOf()

    fun get(organism: Organism): SequenceEntriesDataTable {
        return cachedTables.getOrPut(organism) {
            SequenceEntriesDataTable(compressionService, organism)
        }
    }
}

const val SEQUENCE_ENTRIES_TABLE_NAME = "sequence_entries"

class SequenceEntriesDataTable(
    compressionService: CompressionService,
    organism: Organism,
) : Table(
    SEQUENCE_ENTRIES_TABLE_NAME,
) {
    val originalDataColumn = serializeOriginalData(compressionService, organism).nullable()
    val processedDataColumn = serializeProcessedData(compressionService, organism).nullable()

    val accessionColumn = varchar("accession", 255)
    val versionColumn = long("version")
    val organismColumn = varchar("organism", 255)
    val submissionIdColumn = varchar("submission_id", 255)
    val submitterColumn = varchar("submitter", 255)
    val groupNameColumn = varchar("group_name", 255)
    val submittedAtColumn = datetime("submitted_at")
    val startedProcessingAtColumn = datetime("started_processing_at").nullable()
    val finishedProcessingAtColumn = datetime("finished_processing_at").nullable()
    val statusColumn = varchar("status", 255)
    val isRevocationColumn = bool("is_revocation").default(false)
    val errorsColumn = jacksonSerializableJsonb<List<PreprocessingAnnotation>>("errors").nullable()
    val warningsColumn = jacksonSerializableJsonb<List<PreprocessingAnnotation>>("warnings").nullable()

    override val primaryKey = PrimaryKey(accessionColumn, versionColumn)

    val isMaxVersion = versionColumn eq maxVersionQuery()

    private fun maxVersionQuery(): Expression<Long?> {
        val subQueryTable = alias("subQueryTable")
        return wrapAsExpression(
            subQueryTable
                .slice(subQueryTable[versionColumn].max())
                .select {
                    subQueryTable[accessionColumn] eq accessionColumn
                },
        )
    }

    val isMaxReleasedVersion = versionColumn eq maxReleasedVersionQuery()

    private fun maxReleasedVersionQuery(): Expression<Long?> {
        val subQueryTable = alias("subQueryTable")
        return wrapAsExpression(
            subQueryTable
                .slice(subQueryTable[versionColumn].max())
                .select {
                    (subQueryTable[accessionColumn] eq accessionColumn) and
                        (subQueryTable[statusColumn] eq Status.APPROVED_FOR_RELEASE.name)
                },
        )
    }

    fun accessionVersionIsIn(accessionVersions: List<AccessionVersionInterface>) =
        Pair(accessionColumn, versionColumn) inList accessionVersions.toPairs()

    fun organismIs(organism: Organism) = organismColumn eq organism.name

    fun statusIs(status: Status) = statusColumn eq status.name

    fun statusIsOneOf(vararg status: Status) = statusColumn inList status.map { it.name }

    fun accessionVersionEquals(accessionVersion: AccessionVersionInterface) =
        (accessionColumn eq accessionVersion.accession) and
            (versionColumn eq accessionVersion.version)

    fun groupIs(group: String) = groupNameColumn eq group

    private fun serializeOriginalData(
        compressionService: CompressionService,
        organism: Organism,
    ): Column<OriginalData> = jsonb(
        "original_data",
        { originalData ->
            jacksonObjectMapper.writeValueAsString(
                compressionService.compressSequencesInOriginalData(
                    originalData,
                    organism,
                ),
            )
        },
        { string ->
            compressionService.decompressSequencesInOriginalData(
                jacksonObjectMapper.readValue(string) as OriginalData,
                organism,
            )
        },
    )

    private fun serializeProcessedData(
        compressionService: CompressionService,
        organism: Organism,
    ): Column<ProcessedData> = jsonb(
        "processed_data",
        { processedData ->
            jacksonObjectMapper.writeValueAsString(
                compressionService.compressSequencesInProcessedData(
                    processedData,
                    organism,
                ),
            )
        },
        { string ->
            compressionService.decompressSequencesInProcessedData(
                jacksonObjectMapper.readValue(string) as ProcessedData,
                organism,
            )
        },
    )
}
