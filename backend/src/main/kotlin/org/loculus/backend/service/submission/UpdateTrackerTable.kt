import org.jetbrains.exposed.sql.Table

const val UPDATE_TRACKER_TABLE_NAME = "table_update_tracker"

object UpdateTrackerTable : Table(UPDATE_TRACKER_TABLE_NAME) {
    val lastTimeUpdatedDbColumn = varchar("last_time_updated", 255).nullable()
    val tableNameColumn = varchar("table_name", 255)
}
