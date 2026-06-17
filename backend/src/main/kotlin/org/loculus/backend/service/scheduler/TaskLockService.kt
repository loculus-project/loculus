package org.loculus.backend.service.scheduler

import mu.KotlinLogging
import org.jetbrains.exposed.sql.LongColumnType
import org.jetbrains.exposed.sql.TextColumnType
import org.jetbrains.exposed.sql.statements.StatementType
import org.jetbrains.exposed.sql.transactions.transaction
import org.springframework.stereotype.Service

private val log = KotlinLogging.logger {}

@Service
class TaskLockService {

    fun acquireLock(taskName: String, intervalSeconds: Long): Boolean = transaction {
        val acquired = exec(
            """
            WITH lock_attempt AS (
                INSERT INTO task_lock (task_name, started_at)
                VALUES (?, NOW())
                ON CONFLICT (task_name) DO UPDATE
                SET started_at = NOW()
                WHERE task_lock.started_at IS NULL
                   OR task_lock.started_at + (? * interval '1 second') <= NOW()
                RETURNING task_name
            )
            SELECT COUNT(*) FROM lock_attempt
            """.trimIndent(),
            args = listOf(TextColumnType() to taskName, LongColumnType() to intervalSeconds),
            explicitStatementType = StatementType.SELECT,
        ) { rs ->
            rs.next() && rs.getLong(1) > 0L
        } ?: false

        if (!acquired) {
            log.debug {
                "Task '$taskName' skipped: another replica acquired the lock within the last ${intervalSeconds}s"
            }
        }
        acquired
    }
}
