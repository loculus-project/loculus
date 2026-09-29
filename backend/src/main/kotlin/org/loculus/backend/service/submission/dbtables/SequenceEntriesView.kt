package org.loculus.backend.service.submission

import org.jetbrains.exposed.v1.core.Expression
import org.jetbrains.exposed.v1.core.ExpressionWithColumnType
import org.jetbrains.exposed.v1.core.Op
import org.jetbrains.exposed.v1.core.QueryBuilder
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.VarCharColumnType
import org.jetbrains.exposed.v1.core.alias
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.append
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.inList
import org.jetbrains.exposed.v1.core.max
import org.jetbrains.exposed.v1.core.or
import org.jetbrains.exposed.v1.core.wrapAsExpression
import org.jetbrains.exposed.v1.datetime.datetime
import org.jetbrains.exposed.v1.jdbc.select
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.Organism
import org.loculus.backend.api.PreprocessingAnnotation
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.ProcessingResult
import org.loculus.backend.api.Status
import org.loculus.backend.api.SubmittedData
import org.loculus.backend.api.toPairs
import org.loculus.backend.service.jacksonSerializableJsonb
import org.loculus.backend.service.submission.dbtables.CURRENT_PROCESSING_PIPELINE_TABLE_NAME

const val SEQUENCE_ENTRIES_VIEW_NAME = "sequence_entries_view"
const val SEQUENCE_ENTRIES_LATERAL_VIEW_NAME = "sequence_entries_lateral_view"

object SequenceEntriesView : SequenceEntriesViewTable(SEQUENCE_ENTRIES_VIEW_NAME)

/**
 * Same rows as [SequenceEntriesView], but the external metadata is aggregated per row: much cheaper for queries of a
 * few accessions (`accession in (...)`), which make [SequenceEntriesView] aggregate the whole external_metadata table.
 * Full scans should use [SequenceEntriesView].
 */
object SequenceEntriesLateralView : SequenceEntriesViewTable(SEQUENCE_ENTRIES_LATERAL_VIEW_NAME)

open class SequenceEntriesViewTable(name: String) : Table(name) {
    val submittedDataColumn = jacksonSerializableJsonb<SubmittedData<CompressedSequence>>(
        "submitted_data",
    ).nullable()
    val processedDataColumn =
        jacksonSerializableJsonb<ProcessedData<CompressedSequence>>("processed_data").nullable()
    val jointDataColumn =
        jacksonSerializableJsonb<ProcessedData<CompressedSequence>>("joint_metadata").nullable()

    val accessionColumn = varchar("accession", 255)
    val versionColumn = long("version")
    val organismColumn = varchar("organism", 255)
    val submissionIdColumn = varchar("submission_id", 255)
    val submitterColumn = varchar("submitter", 255)
    val groupIdColumn = integer("group_id")
    val submittedAtTimestampColumn = datetime("submitted_at")
    val startedProcessingAtColumn = datetime("started_processing_at").nullable()
    val finishedProcessingAtColumn = datetime("finished_processing_at").nullable()
    val releasedAtTimestampColumn = datetime("released_at").nullable()
    val statusColumn = varchar("status", 255)
    val processingResultColumn = varchar("processing_result", 255).nullable()
    val isRevocationColumn = bool("is_revocation").default(false)
    val errorsColumn = jacksonSerializableJsonb<List<PreprocessingAnnotation>>("errors").nullable()
    val warningsColumn = jacksonSerializableJsonb<List<PreprocessingAnnotation>>("warnings").nullable()
    val pipelineVersionColumn = long("pipeline_version").nullable()

    override val primaryKey = PrimaryKey(accessionColumn, versionColumn)

    /**
     * The value of [statusColumn], computed so that sequence_entries_preprocessed_data is read only for entries that are
     * neither released nor revocations. Selecting [statusColumn] in a full scan makes Postgres hash-join all of
     * sequence_entries_preprocessed_data (+1.2 s and ~150 MB of temp files per million entries).
     * Keep in sync with the status CASE of sequence_entries_view (GetSubmittedMetadataEndpointTest compares them).
     */
    val statusWithoutJoin: ExpressionWithColumnType<String> = object : ExpressionWithColumnType<String>() {
        override val columnType = VarCharColumnType(255)

        override fun toQueryBuilder(queryBuilder: QueryBuilder) = queryBuilder {
            append("CASE WHEN ", releasedAtTimestampColumn, " IS NOT NULL THEN 'APPROVED_FOR_RELEASE'")
            append(" WHEN ", isRevocationColumn, " THEN 'PROCESSED'")
            append(
                " ELSE COALESCE((SELECT CASE sepd.processing_status",
                " WHEN 'IN_PROCESSING' THEN 'IN_PROCESSING' WHEN 'PROCESSED' THEN 'PROCESSED' END",
                " FROM $SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME sepd",
                " JOIN $CURRENT_PROCESSING_PIPELINE_TABLE_NAME cpp ON cpp.version = sepd.pipeline_version",
                " WHERE sepd.accession = ",
            )
            append(accessionColumn, " AND sepd.version = ", versionColumn, " AND cpp.organism = ", organismColumn)
            append("), 'RECEIVED') END")
        }
    }

    val isMaxVersion = versionColumn eq maxVersionQuery()

    private fun maxVersionQuery(): Expression<Long?> {
        val subQueryTable = alias("subQueryTable")
        return wrapAsExpression(
            subQueryTable
                .select(subQueryTable[versionColumn].max())
                .where { subQueryTable[accessionColumn] eq accessionColumn },
        )
    }

    fun accessionVersionIsIn(accessionVersions: List<AccessionVersionInterface>) =
        Pair(accessionColumn, versionColumn) inList accessionVersions.toPairs()

    fun organismIs(organism: Organism) = organismColumn eq organism.name

    fun processingResultIs(processingResult: ProcessingResult) = processingResultColumn eq processingResult.name

    fun processingResultIsOneOf(processingResults: List<ProcessingResult>) = processingResults
        .fold(Op.FALSE as Op<Boolean>) { acc, result -> acc or processingResultIs(result) }

    fun statusIs(status: Status) = statusColumn eq status.name

    fun statusIsOneOf(statuses: List<Status>) = statusColumn inList statuses.map { it.name }

    fun accessionVersionEquals(accessionVersion: AccessionVersionInterface) =
        (accessionColumn eq accessionVersion.accession) and
            (versionColumn eq accessionVersion.version)

    fun groupIsOneOf(groupIds: List<Int>) = groupIdColumn inList groupIds

    fun submitterIsOneOf(submitterNames: List<String>) = submitterColumn inList submitterNames
}
