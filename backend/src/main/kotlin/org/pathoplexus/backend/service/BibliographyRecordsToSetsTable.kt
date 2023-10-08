package org.pathoplexus.backend.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.json.jsonb

private val jacksonObjectMapper = jacksonObjectMapper().findAndRegisterModules()

private inline fun <reified T : Any> Table.jacksonSerializableJsonb(columnName: String) = jsonb<T>(
    columnName,
    { value -> jacksonObjectMapper.writeValueAsString(value) },
    { string -> jacksonObjectMapper.readValue(string) },
)

object BibliographyRecordsToSetsTable : Table("bibliography_records_to_sets") {
    val bibliographyRecordId = long("bibliography_record_id") references BibliographyRecordsTable.bibliographyRecordId
    val bibliographySetId = uuid("bibliography_set_id") references BibliographySetsTable.bibliographySetId
    val bibliographySetVersion = long("bibliography_set_version") references BibliographySetsTable.bibliographySetVersion

    override val primaryKey = PrimaryKey(bibliographyRecordId, bibliographySetId, bibliographySetVersion)
}
