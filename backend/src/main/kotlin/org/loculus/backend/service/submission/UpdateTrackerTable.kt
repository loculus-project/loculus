import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.datetime

const val UPDATE_TRACKER_TABLE_NAME = "table_update_tracker"

object UpdateTrackerTable : Table(UPDATE_TRACKER_TABLE_NAME) {
    val lastTimeUpdatedDbColumn =
        datetime("last_time_updated").nullable()
    val tableNameColumn = varchar("table_name", 255)
}
