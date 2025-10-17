package org.loculus.backend.service.submission.dbtables

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.loculus.backend.api.MetadataMap
import org.loculus.backend.service.jacksonSerializableJsonb

const val EXTERNAL_METADATA_TABLE_NAME = "external_metadata"

object ExternalMetadataTable : Table(EXTERNAL_METADATA_TABLE_NAME) {
    val accessionColumn = varchar("accession", 255)
    val versionColumn = long("version")
    val updaterIdColumn = varchar("external_metadata_updater", 255)
    val externalMetadataColumn =
        jacksonSerializableJsonb<MetadataMap>("external_metadata").nullable()
    val updatedAtColumn = datetime("updated_metadata_at").nullable()

    override val primaryKey = PrimaryKey(accessionColumn, versionColumn, updaterIdColumn)
}
