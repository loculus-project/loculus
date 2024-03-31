package org.loculus.backend.service.submission

import org.jetbrains.exposed.sql.Table

const val CURRENT_PROCESSING_PIPELINE_TABLE = "current_processing_pipeline"

object CurrentProcessingPipelineTable : Table(CURRENT_PROCESSING_PIPELINE_TABLE) {
    val versionColumn = long("version")
}
