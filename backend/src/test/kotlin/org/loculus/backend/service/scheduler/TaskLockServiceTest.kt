package org.loculus.backend.service.scheduler

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class TaskLockServiceTest(@Autowired private val taskLockService: TaskLockService) {

    @Test
    fun `WHEN lock is acquired for the first time THEN returns true`() {
        val acquired = taskLockService.acquireLock("test-task-new", intervalSeconds = 3600)

        assertThat(acquired, `is`(true))
    }

    @Test
    fun `WHEN lock is already held within the interval THEN second call returns false`() {
        val firstAcquired = taskLockService.acquireLock("test-task-held", intervalSeconds = 3600)
        val secondAcquired = taskLockService.acquireLock("test-task-held", intervalSeconds = 3600)

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

        val acquired = taskLockService.acquireLock("test-task-expired", intervalSeconds = 5)

        assertThat(acquired, `is`(true))
    }

    @Test
    fun `WHEN two different tasks use the same service THEN they have independent locks`() {
        val taskA1 = taskLockService.acquireLock("test-task-a", intervalSeconds = 3600)
        val taskB1 = taskLockService.acquireLock("test-task-b", intervalSeconds = 3600)
        val taskA2 = taskLockService.acquireLock("test-task-a", intervalSeconds = 3600)
        val taskB2 = taskLockService.acquireLock("test-task-b", intervalSeconds = 3600)

        assertThat(taskA1, `is`(true))
        assertThat(taskB1, `is`(true))
        assertThat(taskA2, `is`(false))
        assertThat(taskB2, `is`(false))
    }
}
