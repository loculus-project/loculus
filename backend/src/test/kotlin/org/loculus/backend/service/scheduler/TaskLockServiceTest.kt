package org.loculus.backend.service.scheduler

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.hamcrest.Matchers.notNullValue
import org.jetbrains.exposed.sql.TextColumnType
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class TaskLockServiceTest(@Autowired private val taskLockService: TaskLockService) {

    @Test
    fun `WHEN lock is acquired for the first time THEN returns true`() {
        val acquired = taskLockService.acquireLock("test-task-new", frequencyIntervalSeconds = 3600)

        assertThat(acquired, `is`(true))
    }

    @Test
    fun `WHEN lock is already held within the interval THEN second call returns false`() {
        val firstAcquired = taskLockService.acquireLock("test-task-held", frequencyIntervalSeconds = 3600)
        val secondAcquired = taskLockService.acquireLock("test-task-held", frequencyIntervalSeconds = 3600)

        assertThat(firstAcquired, `is`(true))
        assertThat(secondAcquired, `is`(false))
    }

    @Test
    fun `WHEN lock interval has elapsed THEN lock can be re-acquired`() {
        transaction {
            exec(
                "INSERT INTO task_lock (task_name, started_at) VALUES ('test-task-expired', NOW() - INTERVAL '10 seconds')",
            )
        }
        val acquired = taskLockService.acquireLock("test-task-expired", frequencyIntervalSeconds = 5)

        assertThat(acquired, `is`(true))
    }

    @Test
    fun `WHEN two different tasks use the same service THEN they have independent locks`() {
        val taskA1 = taskLockService.acquireLock("test-task-a", frequencyIntervalSeconds = 3600)
        val taskB1 = taskLockService.acquireLock("test-task-b", frequencyIntervalSeconds = 3600)
        val taskA2 = taskLockService.acquireLock("test-task-a", frequencyIntervalSeconds = 3600)
        val taskB2 = taskLockService.acquireLock("test-task-b", frequencyIntervalSeconds = 3600)

        assertThat(taskA1, `is`(true))
        assertThat(taskB1, `is`(true))
        assertThat(taskA2, `is`(false))
        assertThat(taskB2, `is`(false))
    }

    @Test
    fun `WHEN lock is released before minDuration THEN locked_until is shortened`() {
        taskLockService.acquireLock("test-release-early", frequencyIntervalSeconds = 10)
        val deltaBeforeRelease = lockDeltaSeconds("test-release-early")

        taskLockService.releaseLock("test-release-early", frequencyIntervalSeconds = 10)
        val deltaAfterRelease = lockDeltaSeconds("test-release-early")

        assertThat(deltaBeforeRelease, notNullValue())
        assertThat(deltaAfterRelease, notNullValue())
        assertThat(deltaAfterRelease!! < deltaBeforeRelease!!, `is`(true))
    }

    @Test
    fun `WHEN lock is released before minDuration THEN re-acquire still fails`() {
        taskLockService.acquireLock("test-release-early-held", frequencyIntervalSeconds = 10)
        taskLockService.releaseLock("test-release-early-held", frequencyIntervalSeconds = 10)

        assertThat(taskLockService.acquireLock("test-release-early-held", frequencyIntervalSeconds = 10), `is`(false))
    }

    @Test
    fun `WHEN lock is released after minDuration THEN locked_until is not changed`() {
        // started_at 15s ago — beyond minDuration (9s) — releaseLock is a no-op (UPDATE WHERE clause is false)
        transaction {
            exec(
                "INSERT INTO task_lock (task_name, started_at, locked_until) " +
                    "VALUES ('test-release-late', NOW() - INTERVAL '15 seconds', NOW() + INTERVAL '35 seconds')",
            )
        }
        val deltaBeforeRelease = lockDeltaSeconds("test-release-late")

        taskLockService.releaseLock("test-release-late", frequencyIntervalSeconds = 10)

        val deltaAfterRelease = lockDeltaSeconds("test-release-late")
        assertThat(deltaBeforeRelease, notNullValue())
        assertThat(deltaAfterRelease, notNullValue())
        assertThat(deltaAfterRelease, `is`(deltaBeforeRelease))
    }

    @Test
    fun `WHEN releasing a lock that does not exist THEN no exception is thrown`() {
        taskLockService.releaseLock("test-release-nonexistent", frequencyIntervalSeconds = 10)
    }

    private fun lockDeltaSeconds(taskName: String): Double? = transaction {
        exec(
            "SELECT EXTRACT(EPOCH FROM (locked_until - started_at)) FROM task_lock WHERE task_name = ?",
            args = listOf(TextColumnType() to taskName),
        ) { rs ->
            if (rs.next()) rs.getDouble(1) else null
        }
    }
}
