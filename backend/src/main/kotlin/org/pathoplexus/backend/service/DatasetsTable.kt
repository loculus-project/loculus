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

object DatasetsTable : Table("datasets") {
    val datasetId = uuid("dataset_id").autoGenerate()
    val datasetVersion = long("dataset_version")

    val name = varchar("name", 255)
    val description = varchar("description", 255)
    val createdAt = datetime("created_at")
    val createdBy = varchar("created_by", 255)

    override val primaryKey = PrimaryKey(datasetId)
}
