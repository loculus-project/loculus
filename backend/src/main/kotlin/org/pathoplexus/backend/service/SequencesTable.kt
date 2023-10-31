package org.pathoplexus.backend.service

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.jetbrains.exposed.sql.Expression
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.alias
import org.jetbrains.exposed.sql.json.jsonb
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.wrapAsExpression
import org.pathoplexus.backend.api.OriginalData
import org.pathoplexus.backend.api.PreprocessingAnnotation
import org.pathoplexus.backend.api.ProcessedData

private val jacksonObjectMapper = jacksonObjectMapper().findAndRegisterModules()

private inline fun <reified T : Any> Table.jacksonSerializableJsonb(columnName: String) = jsonb<T>(
    columnName,
    { value -> jacksonObjectMapper.writeValueAsString(value) },
    { string -> jacksonObjectMapper.readValue(string) },
)

object SequencesTable : Table("sequences") {
    val sequenceId = long("sequence_id").autoIncrement()
    val version = long("version")
    val customId = varchar("custom_id", 255)
    val submitter = varchar("submitter", 255)
    val submittedAt = datetime("submitted_at")
    val startedProcessingAt = datetime("started_processing_at").nullable()
    val finishedProcessingAt = datetime("finished_processing_at").nullable()
    val status = varchar("status", 255)
    val isRevocation = bool("is_revocation").default(false)
    val originalData =
        jacksonSerializableJsonb<OriginalData>("original_data").nullable()
    val processedData = jacksonSerializableJsonb<ProcessedData>("processed_data").nullable()
    val errors = jacksonSerializableJsonb<List<PreprocessingAnnotation>>("errors").nullable()
    val warnings = jacksonSerializableJsonb<List<PreprocessingAnnotation>>("warnings").nullable()

    override val primaryKey = PrimaryKey(sequenceId, version)
}

fun maxVersionQuery(): Expression<Long?> {
    val subQueryTable = SequencesTable.alias("subQueryTable")
    return wrapAsExpression(
        subQueryTable
            .slice(subQueryTable[SequencesTable.version].max())
            .select { subQueryTable[SequencesTable.sequenceId] eq SequencesTable.sequenceId },
    )
}
