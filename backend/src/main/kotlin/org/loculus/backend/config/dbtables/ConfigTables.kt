package org.loculus.backend.config.dbtables

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.loculus.backend.config.InstanceConfig
import org.loculus.backend.config.OrganismConfig
import org.loculus.backend.service.jacksonSerializableJsonb

const val CONFIG_ORGANISMS_TABLE_NAME = "config_organisms"
const val CONFIG_INSTANCE_VERSIONS_TABLE_NAME = "config_instance_versions"
const val CONFIG_INSTANCE_STATE_TABLE_NAME = "config_instance_state"
const val CONFIG_ORGANISM_VERSIONS_TABLE_NAME = "config_organism_versions"
const val CONFIG_INSTANCE_DRAFT_TABLE_NAME = "config_instance_draft"
const val CONFIG_ORGANISM_DRAFTS_TABLE_NAME = "config_organism_drafts"
const val CONFIG_AUDIT_LOG_TABLE_NAME = "config_audit_log"
const val CONFIG_PREPROCESSING_FILES_TABLE_NAME = "config_preprocessing_files"

object ConfigOrganismsTable : Table(CONFIG_ORGANISMS_TABLE_NAME) {
    val keyColumn = text("key")
    val statusColumn = text("status") // 'unreleased' | 'released'
    val currentVersionColumn = long("current_version").nullable()
    val deployedColumn = bool("deployed")
    val createdAtColumn = datetime("created_at")
    val createdByColumn = text("created_by")
    val firstPublishedAtColumn = datetime("first_published_at").nullable()
    val lastPublishedAtColumn = datetime("last_published_at").nullable()

    override val primaryKey = PrimaryKey(keyColumn)
}

object ConfigInstanceVersionsTable : Table(CONFIG_INSTANCE_VERSIONS_TABLE_NAME) {
    val versionColumn = long("version").autoIncrement()
    val configColumn = jacksonSerializableJsonb<InstanceConfig>("config")
    val publishedAtColumn = datetime("published_at")
    val publishedByColumn = text("published_by")

    override val primaryKey = PrimaryKey(versionColumn)
}

object ConfigInstanceStateTable : Table(CONFIG_INSTANCE_STATE_TABLE_NAME) {
    val singletonColumn = bool("singleton")
    val currentVersionColumn = long("current_version").nullable()

    override val primaryKey = PrimaryKey(singletonColumn)
}

object ConfigOrganismVersionsTable : Table(CONFIG_ORGANISM_VERSIONS_TABLE_NAME) {
    val organismKeyColumn = text("organism_key")
    val versionColumn = long("version")
    val configColumn = jacksonSerializableJsonb<OrganismConfig>("config")
    val publishedAtColumn = datetime("published_at")
    val publishedByColumn = text("published_by")

    override val primaryKey = PrimaryKey(organismKeyColumn, versionColumn)
}

object ConfigInstanceDraftTable : Table(CONFIG_INSTANCE_DRAFT_TABLE_NAME) {
    val singletonColumn = bool("singleton")
    val configColumn = jacksonSerializableJsonb<InstanceConfig>("config")
    val baseVersionColumn = long("base_version").nullable()
    val revisionColumn = long("revision")
    val createdAtColumn = datetime("created_at")
    val updatedAtColumn = datetime("updated_at")
    val createdByColumn = text("created_by")
    val updatedByColumn = text("updated_by")

    override val primaryKey = PrimaryKey(singletonColumn)
}

object ConfigOrganismDraftsTable : Table(CONFIG_ORGANISM_DRAFTS_TABLE_NAME) {
    val organismKeyColumn = text("organism_key")
    val configColumn = jacksonSerializableJsonb<OrganismConfig>("config")
    val baseVersionColumn = long("base_version").nullable()
    val revisionColumn = long("revision")
    val createdAtColumn = datetime("created_at")
    val updatedAtColumn = datetime("updated_at")
    val createdByColumn = text("created_by")
    val updatedByColumn = text("updated_by")

    override val primaryKey = PrimaryKey(organismKeyColumn)
}

// Opaque, unversioned preprocessing config files, keyed by (organism, pipeline version).
// The backend stores/serves the text verbatim; it never parses or interprets it.
object ConfigPreprocessingFilesTable : Table(CONFIG_PREPROCESSING_FILES_TABLE_NAME) {
    val organismKeyColumn = text("organism_key")
    val pipelineVersionColumn = long("pipeline_version")
    val configFileColumn = text("config_file")
    val updatedAtColumn = datetime("updated_at")
    val updatedByColumn = text("updated_by")

    override val primaryKey = PrimaryKey(organismKeyColumn, pipelineVersionColumn)
}

object ConfigAuditLogTable : Table(CONFIG_AUDIT_LOG_TABLE_NAME) {
    val idColumn = long("id").autoIncrement()
    val occurredAtColumn = datetime("occurred_at")
    val actorColumn = text("actor")
    val scopeColumn = text("scope") // 'instance' | 'organism'
    val organismKeyColumn = text("organism_key").nullable()
    val actionColumn = text("action")
    val detailsColumn = jacksonSerializableJsonb<Map<String, Any>>("details").nullable()
    val resultVersionColumn = long("result_version").nullable()

    override val primaryKey = PrimaryKey(idColumn)
}
