package org.loculus.backend.service.submission.dbtables

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.datetime.datetime

const val PREPROCESSING_QUEUE_VERSIONS_TABLE_NAME = "preprocessing_queue_versions"

// Pipeline versions with a queue. The enqueue trigger reads it, initialized_at is set once the backfill completes.
object PreprocessingQueueVersionsTable : Table(PREPROCESSING_QUEUE_VERSIONS_TABLE_NAME) {
    val organismColumn = varchar("organism", 255)
    val pipelineVersionColumn = long("pipeline_version")
    val initializedAtColumn = datetime("initialized_at").nullable()

    override val primaryKey = PrimaryKey(organismColumn, pipelineVersionColumn)
}
