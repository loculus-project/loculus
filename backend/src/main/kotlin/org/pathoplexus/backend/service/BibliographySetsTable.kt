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

object BibliographySetsTable : Table("bibliography_sets") {
    val bibliographySetId = long("bibliography_set_id").autoIncrement()

    val data = varchar("data", 255)
    val name = varchar("name", 255)
    val type = varchar("type", 255)

    val createdAt = datetime("created_at")
    val createdBy = varchar("created_by", 255)
    val updatedAt = datetime("updated_at")
    val updatedBy = varchar("updated_by", 255)
    val metadata = jacksonSerializableJsonb<JsonNode>("metadata").nullable()
    
    override val primaryKey = PrimaryKey(bibliographySetId)
}
