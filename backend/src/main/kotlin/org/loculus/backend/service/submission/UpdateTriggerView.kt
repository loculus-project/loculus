import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import java.sql.Timestamp

const val UPDATE_TRIGGER_VIEW_NAME = "update_trigger_view"

object UpdateTriggerView : Table(UPDATE_TRIGGER_VIEW_NAME) {
    val lastTimeUpdatedDbColumn =
        datetime("last_time_updated_db").nullable()

    fun lastTimeUpdatedDb(): Timestamp? {
        // Start a transaction to query the database
        return transaction {
            // Select the first row from the table
            val firstRow = UpdateTriggerView
                .selectAll()
                .limit(1) // We only need the first row
                .firstOrNull() // Get the first row or return null if no rows

            // Extract the value from the first row, if it exists
            firstRow?.let { row ->
                row[lastTimeUpdatedDbColumn]?.let {
                    // Convert the DateTime to a java.sql.Timestamp
                    Timestamp.valueOf(it.toString())
                }
            }
        }
    }
}
