package org.loculus.backend.service.submission

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.jetbrains.exposed.sql.selectAll

const val CURRENT_PROCESSING_PIPELINE_TABLE_NAME = "current_processing_pipeline"

object CurrentProcessingPipelineTable : Table(CURRENT_PROCESSING_PIPELINE_TABLE_NAME) {
    val versionColumn = long("version")
    val organismColumn = varchar("organism", 255)
    val startedUsingAtColumn = datetime("started_using_at")

    fun pipelineNeedsUpdate(foundVersion: Long, organism: String) =
        CurrentProcessingPipelineTable
            .selectAll()
            .where { CurrentProcessingPipelineTable.versionColumn neq foundVersion }
            .andWhere { CurrentProcessingPipelineTable.organismColumn eq organism }
            .limit(1)
            .empty()
            .not()
}
