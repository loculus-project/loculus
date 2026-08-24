package org.loculus.backend.service.submission

import org.jetbrains.exposed.v1.core.CustomFunction
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.TextColumnType
import org.jetbrains.exposed.v1.core.stringLiteral
import org.jetbrains.exposed.v1.datetime.CurrentTimestamp

const val UPDATE_TRACKER_TABLE_NAME = "table_update_tracker"

object UpdateTrackerTable : Table(UPDATE_TRACKER_TABLE_NAME) {
    val tableNameColumn = text("table_name")

    // Table-wide writes leave organism and pipeline_version both NULL
    // Uniqueness over (table_name, organism, pipeline_version) is
    // enforced by a UNIQUE NULLS NOT DISTINCT constraint in the database.
    val organismColumn = text("organism").nullable()
    val pipelineVersionColumn = long("pipeline_version").nullable()

    // Only ever written by the update_table_tracker() trigger (see V1.2__add_table_update_tracker.sql),
    // which always supplies its own value - this default is never actually relied on by Exposed.
    val lastTimeUpdatedDbColumn = text("last_time_updated")
        .defaultExpression(CustomFunction("timezone", TextColumnType(), stringLiteral("UTC"), CurrentTimestamp))
}
