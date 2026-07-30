package org.loculus.backend.service.submission.dbtables

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.datetime

const val PREPROCESSING_QUEUE_VERSIONS_TABLE_NAME = "preprocessing_queue_versions"

object PreprocessingQueueVersionsTable : Table(PREPROCESSING_QUEUE_VERSIONS_TABLE_NAME) {
    val organismColumn = varchar("organism", 255)
    val pipelineVersionColumn = long("pipeline_version")
    val initializedAtColumn = datetime("initialized_at").databaseGenerated()

    override val primaryKey = PrimaryKey(organismColumn, pipelineVersionColumn)
}
