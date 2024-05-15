package org.loculus.backend.service.submission

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.datetime

const val CURRENT_PROCESSING_PIPELINE_TABLE = "current_processing_pipeline"

object CurrentProcessingPipelineTable : Table(CURRENT_PROCESSING_PIPELINE_TABLE) {
    val versionColumn = long("version")
    val startedUsingAtColumn = datetime("started_using_at")
}
