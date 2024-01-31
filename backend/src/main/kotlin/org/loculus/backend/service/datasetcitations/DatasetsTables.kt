package org.loculus.backend.service.datasetcitations

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.datetime

object DatasetsTable : Table("datasets") {
    val datasetId = uuid("dataset_id").autoGenerate()
    val datasetVersion = long("dataset_version")

    val name = varchar("name", 255)
    val description = varchar("description", 255)
    val datasetDOI = varchar("dataset_doi", 255)
    val createdAt = datetime("created_at")
    val createdBy = varchar("created_by", 255)

    override val primaryKey = PrimaryKey(datasetId, datasetVersion)
}

object DatasetRecordsTable : Table("dataset_records") {
    val datasetRecordId = long("dataset_record_id").autoIncrement()

    val accession = varchar("accession", 255)
    val type = varchar("type", 255)
    override val primaryKey = PrimaryKey(datasetRecordId)
}

object DatasetToRecordsTable : Table("dataset_to_records") {
    val datasetRecordId = long("dataset_record_id") references DatasetRecordsTable.datasetRecordId
    val datasetId = uuid("dataset_id") references DatasetsTable.datasetId
    val datasetVersion = long("dataset_version") references DatasetsTable.datasetVersion

    override val primaryKey = PrimaryKey(datasetRecordId, datasetId, datasetVersion)
}
