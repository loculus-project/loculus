package org.loculus.backend.service.submission

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.datetime.datetime
import org.loculus.backend.api.FileCategoryFilesMap
import org.loculus.backend.service.jacksonSerializableJsonb

const val METADATA_UPLOAD_AUX_TABLE_NAME = "metadata_upload_aux_table"

object MetadataUploadAuxTable : Table(METADATA_UPLOAD_AUX_TABLE_NAME) {
    val accessionColumn = text("accession").nullable()
    val versionColumn = long("version").nullable()
    val uploadIdColumn = text("upload_id")
    val organismColumn = text("organism")
    val submissionIdColumn = text("submission_id")
    val fastaIdsColumn = array<String>("fasta_ids").nullable()
    val submitterColumn = text("submitter")
    val groupIdColumn = integer("group_id").nullable()
    val uploadedAtColumn = datetime("uploaded_at")
    val metadataColumn =
        jacksonSerializableJsonb<Map<String, String>>("metadata")
    val filesColumn =
        jacksonSerializableJsonb<FileCategoryFilesMap>("files").nullable()
    override val primaryKey = PrimaryKey(uploadIdColumn, submissionIdColumn)
}
