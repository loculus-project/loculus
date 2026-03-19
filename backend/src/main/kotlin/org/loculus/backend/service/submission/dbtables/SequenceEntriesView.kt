package org.loculus.backend.service.submission

import org.jetbrains.exposed.sql.Expression
import org.jetbrains.exposed.sql.Op
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.alias
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.wrapAsExpression
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.EnaDepositionStatus
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalData
import org.loculus.backend.api.PreprocessingAnnotation
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.ProcessingResult
import org.loculus.backend.api.Status
import org.loculus.backend.api.toPairs
import org.loculus.backend.service.jacksonSerializableJsonb

const val SEQUENCE_ENTRIES_VIEW_NAME = "sequence_entries_view"

object SequenceEntriesView : Table(SEQUENCE_ENTRIES_VIEW_NAME) {
    val originalDataColumn = jacksonSerializableJsonb<OriginalData<CompressedSequence>>("original_data").nullable()
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
    val versionCommentColumn = varchar("version_comment", 255).nullable()
    val errorsColumn = jacksonSerializableJsonb<List<PreprocessingAnnotation>>("errors").nullable()
    val warningsColumn = jacksonSerializableJsonb<List<PreprocessingAnnotation>>("warnings").nullable()
    val pipelineVersionColumn = long("pipeline_version").nullable()
    val enaDepositionStatusColumn = varchar("ena_deposition_status", 255)

    override val primaryKey = PrimaryKey(accessionColumn, versionColumn)

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
    fun enDepositionStatusIs(status: EnaDepositionStatus) = enaDepositionStatusColumn eq status.name
}
