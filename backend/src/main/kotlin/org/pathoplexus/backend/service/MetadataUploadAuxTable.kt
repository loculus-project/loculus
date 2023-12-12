package org.pathoplexus.backend.service

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.datetime

const val METADATA_UPLOAD_TABLE_NAME = "metadata_upload_aux_table"

object MetadataUploadAuxTable : Table(METADATA_UPLOAD_TABLE_NAME) {
    val accessionColumn = varchar("accession", 255).nullable()
    val versionColumn = long("version").nullable()
    val uploadIdColumn = varchar("upload_id", 255)
    val organismColumn = varchar("organism", 255)
    val submissionIdColumn = varchar("submission_id", 255)
    val submitterColumn = varchar("submitter", 255)
    val uploadedAtColumn = datetime("uploaded_at")
    val metadataColumn =
        jacksonSerializableJsonb<Map<String, String>>("metadata").nullable()
    override val primaryKey = PrimaryKey(uploadIdColumn, submissionIdColumn)
}
