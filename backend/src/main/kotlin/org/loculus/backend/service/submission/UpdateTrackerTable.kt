import kotlinx.datetime.LocalDateTime
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.kotlin.datetime.datetime

const val UPDATE_TRACKER_TABLE_NAME = "table_update_tracker"

object UpdateTrackerTable : Table(UPDATE_TRACKER_TABLE_NAME) {
    val lastTimeUpdatedDbColumn =
        datetime("last_time_updated").nullable()
    val tableNameColumn = varchar("table_name", 255)

    val islatestUpdate = lastTimeUpdatedDbColumn eq latestUpdate()

    private fun latestUpdate(): Expression<LocalDateTime?> {
        val subQueryTable = alias("subQueryTable")
        return wrapAsExpression(
            subQueryTable
                .select(subQueryTable[lastTimeUpdatedDbColumn].max()),
        )
    }
}
