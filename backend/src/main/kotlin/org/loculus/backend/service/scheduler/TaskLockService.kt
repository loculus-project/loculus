package org.loculus.backend.service.scheduler

import mu.KotlinLogging
import org.jetbrains.exposed.sql.LongColumnType
import org.jetbrains.exposed.sql.TextColumnType
import org.jetbrains.exposed.sql.statements.StatementType
import org.jetbrains.exposed.sql.transactions.transaction
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service

private val log = KotlinLogging.logger {}

const val TASK_LOCK_TABLE_NAME = "task_lock"

/**
 * Lock can be acquired when current time > `locked_until` (or no row for this task exists)
 * When acquiring, `locked_until` is set to `currentTime + maxLockFactor * frequencyIntervalSeconds`
 * When releasing, `locked_until` is reduced to `started_at + minLockFactor * frequencyIntervalSeconds`
 * maxLockFactor prevents concurrent execution even if tasks run longer than the interval
 * minLockFactor prevents multiple backends from starting new tasks before the interval is almost over
 */
@Service
class TaskLockService(
    @Value("\${loculus.task-lock.min-lock-factor:0.9}") private val minLockFactor: Double,
    @Value("\${loculus.task-lock.max-lock-factor:5.0}") private val maxLockFactor: Double,
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
     * If locked_until is still in the future update locked_until to the minimum duration, otherwise do nothing.
     *
     * @param taskName unique name identifying the task.
     */
    fun releaseLock(taskName: String, frequencyIntervalSeconds: Long) = transaction {
        // The effective lock duration is shortened by [minLockFactor] to prevent tasks
        // from being blocked after their scheduled interval due to minor clock skew,
        // execution delays, or lock acquisition latency.
        val minDuration = (frequencyIntervalSeconds * minLockFactor).toLong()

        val updated = exec(
            """
        UPDATE task_lock
        SET locked_until = started_at + (? * interval '1 second')
        WHERE task_name = ?
          AND locked_until > NOW()
        RETURNING task_name
            """.trimIndent(),
            args = listOf(
                LongColumnType() to minDuration,
                TextColumnType() to taskName,
            ),
            explicitStatementType = StatementType.SELECT,
        ) { rs ->
            rs.next()
        } ?: false

        if (updated) {
            log.debug {
                "Task '$taskName' lock: 'locked_until' shortened to minimum duration (${minDuration}s)"
            }
        } else {
            log.debug {
                "Task '$taskName' lock: not shortened because 'locked_until' has already elapsed"
            }
        }
    }
}
