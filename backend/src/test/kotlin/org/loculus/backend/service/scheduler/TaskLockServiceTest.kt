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
class TaskLockServiceTest(@Autowired private val taskLockServiceFactory: TaskLockServiceFactory) {

    @Test
    fun `WHEN lock is acquired for the first time THEN returns true`() {
        val taskLockService = taskLockServiceFactory.create(frequencyIntervalSeconds = 3600)
        val acquired = taskLockService.acquireLock("test-task-new")

        assertThat(acquired, `is`(true))
    }

    @Test
    fun `WHEN lock is already held within the interval THEN second call returns false`() {
        val taskLockService = taskLockServiceFactory.create(frequencyIntervalSeconds = 3600)
        val firstAcquired = taskLockService.acquireLock("test-task-held")
        val secondAcquired = taskLockService.acquireLock("test-task-held")

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
        val taskLockService = taskLockServiceFactory.create(frequencyIntervalSeconds = 5)
        val acquired = taskLockService.acquireLock("test-task-expired")

        assertThat(acquired, `is`(true))
    }

    @Test
    fun `WHEN two different tasks use the same service THEN they have independent locks`() {
        val taskLockService = taskLockServiceFactory.create(frequencyIntervalSeconds = 3600)
        val taskA1 = taskLockService.acquireLock("test-task-a")
        val taskB1 = taskLockService.acquireLock("test-task-b")
        val taskA2 = taskLockService.acquireLock("test-task-a")
        val taskB2 = taskLockService.acquireLock("test-task-b")

        assertThat(taskA1, `is`(true))
        assertThat(taskB1, `is`(true))
        assertThat(taskA2, `is`(false))
        assertThat(taskB2, `is`(false))
    }

    @Test
    fun `WHEN lock is released before minDuration THEN locked_until is shortened`() {
        val service = taskLockServiceFactory.create(frequencyIntervalSeconds = 10)
        service.acquireLock("test-release-early")
        val deltaBeforeRelease = lockDeltaSeconds("test-release-early")

        service.releaseLock("test-release-early")
        val deltaAfterRelease = lockDeltaSeconds("test-release-early")

        assertThat(deltaBeforeRelease, notNullValue())
        assertThat(deltaAfterRelease, notNullValue())
        assertThat(deltaAfterRelease!! < deltaBeforeRelease!!, `is`(true))
    }

    @Test
    fun `WHEN lock is released before minDuration THEN re-acquire still fails`() {
        val service = taskLockServiceFactory.create(frequencyIntervalSeconds = 10)
        service.acquireLock("test-release-early-held")
        service.releaseLock("test-release-early-held")

        assertThat(service.acquireLock("test-release-early-held"), `is`(false))
    }

    @Test
    fun `WHEN lock is released after minDuration THEN lock row is deleted and re-acquire succeeds`() {
        // started_at 15s ago — beyond minDuration (9s) — so releaseLock takes the DELETE path
        transaction {
            exec(
                "INSERT INTO task_lock (task_name, started_at, locked_until) " +
                    "VALUES ('test-release-late', NOW() - INTERVAL '15 seconds', NOW() + INTERVAL '35 seconds')",
            )
        }
        val service = taskLockServiceFactory.create(frequencyIntervalSeconds = 10)
        service.releaseLock("test-release-late")

        val lockExists = transaction {
            exec("SELECT COUNT(*) FROM task_lock WHERE task_name = 'test-release-late'") { rs ->
                rs.next() && rs.getLong(1) > 0L
            } ?: false
        }
        assertThat(lockExists, `is`(false))
        assertThat(service.acquireLock("test-release-late"), `is`(true))
    }

    @Test
    fun `WHEN releasing a lock that does not exist THEN no exception is thrown`() {
        val service = taskLockServiceFactory.create(frequencyIntervalSeconds = 10)
        service.releaseLock("test-release-nonexistent")
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
