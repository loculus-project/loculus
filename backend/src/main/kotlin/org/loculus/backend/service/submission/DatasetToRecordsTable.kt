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

object DatasetToRecordsTable : Table("dataset_to_records") {
    val datasetRecordId = long("dataset_record_id") references DatasetRecordsTable.datasetRecordId
    val datasetId = uuid("dataset_id") references DatasetsTable.datasetId
    val datasetVersion = long("dataset_version") references DatasetsTable.datasetVersion

    override val primaryKey = PrimaryKey(datasetRecordId, datasetId, datasetVersion)
}
