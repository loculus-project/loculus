package org.loculus.backend.service.submission

import org.jetbrains.exposed.sql.Table

const val UPDATE_TRACKER_TABLE_NAME = "table_update_tracker"

object UpdateTrackerTable : Table(UPDATE_TRACKER_TABLE_NAME) {
    val tableNameColumn = text("table_name")

    // Organism and pipeline version dimensions. Table-wide writes use the '' / 0
    // sentinels; preprocessed-data writes are tagged with the actual organism and
    // pipeline version (see V1.28 migration).
    val organismColumn = text("organism")
    val pipelineVersionColumn = long("pipeline_version")
    val lastTimeUpdatedDbColumn = text("last_time_updated")

    override val primaryKey = PrimaryKey(tableNameColumn, organismColumn, pipelineVersionColumn)
}
