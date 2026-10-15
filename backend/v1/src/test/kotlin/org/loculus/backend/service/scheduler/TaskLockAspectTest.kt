package org.loculus.backend.service.scheduler

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.aspectj.lang.ProceedingJoinPoint
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.util.concurrent.TimeUnit

class TaskLockAspectTest {
    private val taskLockService = mockk<TaskLockService>(relaxed = true)
    private val joinPoint = mockk<ProceedingJoinPoint>()
    private val aspect = TaskLockAspect(taskLockService).also {
        it.setEmbeddedValueResolver { value -> if (value == "\${task.interval}") "10" else value }
    }

    @Test
    fun `WHEN lock cannot be acquired THEN task body is skipped`() {
        every { taskLockService.acquireLock("test-task", frequencyIntervalSeconds = 10) } returns false

        val result = aspect.lockTask(joinPoint, taskLock())

        assertThat(result, `is`(nullValue()))
        verify(exactly = 0) { joinPoint.proceed() }
        verify(exactly = 0) { taskLockService.releaseLock(any(), any()) }
    }

    @Test
    fun `WHEN lock is acquired THEN task body is run and lock is released`() {
        every { taskLockService.acquireLock("test-task", frequencyIntervalSeconds = 10) } returns true
        every { joinPoint.proceed() } returns "done"

        val result = aspect.lockTask(joinPoint, taskLock())

        assertThat(result, `is`("done"))
        verify { joinPoint.proceed() }
        verify { taskLockService.releaseLock("test-task", frequencyIntervalSeconds = 10) }
    }

    @Test
    fun `WHEN task body throws THEN lock is still released`() {
        every { taskLockService.acquireLock("test-task", frequencyIntervalSeconds = 10) } returns true
        every { joinPoint.proceed() } throws IllegalStateException("boom")

        assertThrows<IllegalStateException> {
            aspect.lockTask(joinPoint, taskLock())
        }

        verify { taskLockService.releaseLock("test-task", frequencyIntervalSeconds = 10) }
    }

    @Test
    fun `WHEN lock interval uses minutes THEN interval is converted to seconds`() {
        every { taskLockService.acquireLock("test-task", frequencyIntervalSeconds = 600) } returns true
        every { joinPoint.proceed() } returns Unit

        aspect.lockTask(joinPoint, taskLock(timeUnit = TimeUnit.MINUTES))

        verify { taskLockService.acquireLock("test-task", frequencyIntervalSeconds = 600) }
        verify { taskLockService.releaseLock("test-task", frequencyIntervalSeconds = 600) }
    }

    private fun taskLock(timeUnit: TimeUnit = TimeUnit.SECONDS) = TaskLock(
        name = "test-task",
        intervalString = "\${task.interval}",
        timeUnit = timeUnit,
    )
}
