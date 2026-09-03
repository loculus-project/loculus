package org.loculus.backend.service.submission

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.datetime.datetime

const val UPDATE_TRACKER_TABLE_NAME = "table_update_tracker"

object UpdateTrackerTable : Table(UPDATE_TRACKER_TABLE_NAME) {
    val tableNameColumn = text("table_name")

    // Table-wide writes leave organism and pipeline_version both NULL
    // Uniqueness over (table_name, organism, pipeline_version) is
    // enforced by a UNIQUE NULLS NOT DISTINCT constraint in the database.
    val organismColumn = text("organism").nullable()
    val pipelineVersionColumn = long("pipeline_version").nullable()
    val lastTimeUpdatedDbColumn = datetime("last_time_updated")
}
