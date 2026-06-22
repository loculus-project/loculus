package org.loculus.backend.service.scheduler

import mu.KotlinLogging
import org.jetbrains.exposed.sql.LongColumnType
import org.jetbrains.exposed.sql.TextColumnType
import org.jetbrains.exposed.sql.statements.StatementType
import org.jetbrains.exposed.sql.transactions.transaction
import org.springframework.stereotype.Service

private val log = KotlinLogging.logger {}

const val TASK_LOCK_TABLE_NAME = "task_lock"

@Service
class TaskLockService(
    private val minLockFactor: Double,
    private val maxLockFactor: Double,
) {

    /**
     * Attempts to acquire a lock for the given task.
     *
     * If the task dies or is terminated, the lock will be released after [maxDuration] seconds.
     *
     * @param taskName unique name identifying the task.
     * @param maxDuration maximum duration for which to hold the lock in seconds.
     * @return true if the lock was acquired, false if another instance holds it.
     */
    fun acquireLock(taskName: String, frequencyIntervalSeconds: Long): Boolean = transaction {
        val maxDuration = (frequencyIntervalSeconds * maxLockFactor).toLong()
        val acquired = exec(
            """
            WITH lock_attempt AS (
                INSERT INTO task_lock (task_name, started_at, locked_until)
                VALUES (?, NOW(), NOW() + (? * interval '1 second'))
                ON CONFLICT (task_name) DO UPDATE
                SET started_at = NOW(), locked_until = NOW() + (? * interval '1 second')
                WHERE task_lock.locked_until <= NOW()
                RETURNING task_name
            )
            SELECT COUNT(*) FROM lock_attempt
            """.trimIndent(),
            args = listOf(
                TextColumnType() to taskName,
                LongColumnType() to maxDuration,
                LongColumnType() to maxDuration,
            ),
            // The CTE starts with INSERT, so Exposed would default to StatementType.INSERT and
            // not return a ResultSet. Overriding to SELECT lets us read the outer COUNT(*).
            explicitStatementType = StatementType.SELECT,
        ) { rs ->
            rs.next() && rs.getLong(1) > 0L
        } ?: false

        if (!acquired) {
            log.debug {
                "Task '$taskName' skipped: another replica acquired the lock within the last ${maxDuration}s"
            }
        }
        acquired
    }

    /**
     * Attempts to "release" a lock for the given task, this is only possible if the
     * lock is considered expired based on the [minLockFactor].
     * If the lock_until is still in the future update the lock_until till the minimum duration, otherwise do nothing.
     *
     * @param taskName unique name identifying the task.
     * @return true if the lock was released, false if the lock was not found or is still held.
     */
    fun releaseLock(taskName: String, frequencyIntervalSeconds: Long) = transaction {
        // The effective lock duration is shortened by [minLockFactor] to prevent tasks
        // from being blocked after their scheduled interval due to minor clock skew,
        // execution delays, or lock acquisition latency.
        val minDuration: Long =
            (frequencyIntervalSeconds * minLockFactor).toLong()
        exec(
            """
        UPDATE task_lock
        SET locked_until = started_at + (? * interval '1 second')
        WHERE task_name = ?
          AND (started_at + (? * interval '1 second')) > NOW()
            """.trimIndent(),
            args = listOf(
                TextColumnType() to taskName,
                LongColumnType() to minDuration,
                LongColumnType() to minDuration,
                TextColumnType() to taskName,
            ),
            explicitStatementType = StatementType.UPDATE,
        )
    }
}
