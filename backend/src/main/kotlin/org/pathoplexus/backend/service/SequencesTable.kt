package org.pathoplexus.backend.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.json.jsonb
import org.jetbrains.exposed.sql.kotlin.datetime.datetime

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
    val revoked = bool("revoked").default(false)
    val originalData =
        jacksonSerializableJsonb<OriginalData>("original_data").nullable()
    val processedData = jacksonSerializableJsonb<JsonNode>("processed_data").nullable()
    val errors = jacksonSerializableJsonb<JsonNode>("errors").nullable()
    val warnings = jacksonSerializableJsonb<JsonNode>("warnings").nullable()

    override val primaryKey = PrimaryKey(sequenceId, version)
}
