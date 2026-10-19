package org.loculus.backend.service.submission.dbtables

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.datetime.datetime
import org.loculus.backend.api.MetadataMap
import org.loculus.backend.service.jacksonSerializableJsonb

const val ACCESSION_EXTERNAL_METADATA_TABLE_NAME = "accession_external_metadata"

/**
 * External metadata that applies to all versions of an accession.
 * It is overlaid on top of the processed metadata, but below the version-scoped [ExternalMetadataTable].
 */
object AccessionExternalMetadataTable : Table(ACCESSION_EXTERNAL_METADATA_TABLE_NAME) {
    val accessionColumn = varchar("accession", 255)
    val updaterIdColumn = varchar("external_metadata_updater", 255)
    val externalMetadataColumn =
        jacksonSerializableJsonb<MetadataMap>("external_metadata").nullable()
    val updatedAtColumn = datetime("updated_metadata_at").nullable()

    override val primaryKey = PrimaryKey(accessionColumn, updaterIdColumn)
}
