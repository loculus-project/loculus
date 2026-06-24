package org.loculus.backend.service.scheduler

import org.aspectj.lang.ProceedingJoinPoint
import org.aspectj.lang.annotation.Around
import org.aspectj.lang.annotation.Aspect
import org.springframework.context.EmbeddedValueResolverAware
import org.springframework.stereotype.Component
import org.springframework.util.StringValueResolver

@Aspect
@Component
class TaskLockAspect(private val taskLockService: TaskLockService) : EmbeddedValueResolverAware {
    private lateinit var embeddedValueResolver: StringValueResolver

    override fun setEmbeddedValueResolver(resolver: StringValueResolver) {
        embeddedValueResolver = resolver
    }

    @Around(value = "@annotation(taskLock)", argNames = "joinPoint,taskLock")
    fun lockTask(joinPoint: ProceedingJoinPoint, taskLock: TaskLock): Any? {
        val intervalSeconds = taskLock.timeUnit.toSeconds(resolveInterval(taskLock))
        if (!taskLockService.acquireLock(taskLock.name, frequencyIntervalSeconds = intervalSeconds)) return null

        try {
            return joinPoint.proceed()
        } finally {
            taskLockService.releaseLock(taskLock.name, frequencyIntervalSeconds = intervalSeconds)
        }
    }

    private fun resolveInterval(taskLock: TaskLock): Long {
        val resolvedInterval = embeddedValueResolver.resolveStringValue(taskLock.intervalString)
            ?: throw IllegalArgumentException("Could not resolve lock interval for task '${taskLock.name}'")

        return resolvedInterval.toLongOrNull()
            ?: throw IllegalArgumentException(
                "Lock interval for task '${taskLock.name}' must resolve to a whole number, but was '$resolvedInterval'",
            )
    }
}
