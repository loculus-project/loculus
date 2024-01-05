package org.loculus.backend.service.submission

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

object DatasetRecordsTable : Table("dataset_records") {
    val datasetRecordId = long("dataset_record_id").autoIncrement()

    val accession = varchar("accession", 255)
    val type = varchar("type", 255)
    override val primaryKey = PrimaryKey(datasetRecordId)
}
