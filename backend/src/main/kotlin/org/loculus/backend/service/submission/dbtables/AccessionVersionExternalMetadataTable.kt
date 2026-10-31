package org.loculus.backend.service.submission.dbtables

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.datetime.datetime
import org.loculus.backend.service.jacksonSerializableJsonb
import org.loculus.backend.types.MetadataMap

const val ACCESSION_VERSION_EXTERNAL_METADATA_TABLE_NAME = "accession_version_external_metadata"

/**
 * External metadata that applies to a single accession version.
 * It takes precedence over the accession-scoped [AccessionExternalMetadataTable].
 */
object AccessionVersionExternalMetadataTable : Table(ACCESSION_VERSION_EXTERNAL_METADATA_TABLE_NAME) {
    val accessionColumn = varchar("accession", 255)
    val versionColumn = long("version")
    val updaterIdColumn = varchar("external_metadata_updater", 255)
    val externalMetadataColumn =
        jacksonSerializableJsonb<MetadataMap>("external_metadata").nullable()
    val updatedAtColumn = datetime("updated_metadata_at").nullable()

    override val primaryKey = PrimaryKey(accessionColumn, versionColumn, updaterIdColumn)
}
