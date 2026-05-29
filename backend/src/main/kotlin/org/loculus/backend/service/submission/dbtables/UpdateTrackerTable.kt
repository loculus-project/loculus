package org.loculus.backend.service.submission

import org.jetbrains.exposed.sql.Table

const val UPDATE_TRACKER_TABLE_NAME = "table_update_tracker"

object UpdateTrackerTable : Table(UPDATE_TRACKER_TABLE_NAME) {
    val tableNameColumn = text("table_name")
    val organismColumn = text("organism").nullable()
    val lastTimeUpdatedDbColumn = text("last_time_updated")
}
