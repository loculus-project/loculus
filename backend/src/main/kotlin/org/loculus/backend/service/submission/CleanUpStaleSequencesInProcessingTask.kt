package org.loculus.backend.service.submission

import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.service.scheduler.TaskLockService
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.TimeUnit

private val log = mu.KotlinLogging.logger {}

const val CLEAN_UP_STALE_SEQUENCES_IN_PROCESSING_TASK_NAME = "clean-up-stale-sequences-in-processing"

@Component
class CleanUpStaleSequencesInProcessingTask(
    private val submissionDatabaseService: SubmissionDatabaseService,
    private val taskLockService: TaskLockService,
    @Value("\${${BackendSpringProperty.STALE_AFTER_SECONDS}}") private val timeToStaleInSeconds: Long,
    @Value("\${${BackendSpringProperty.CLEAN_UP_RUN_EVERY_SECONDS}}") private val runEverySeconds: Long,
) {
    @Scheduled(fixedRateString = "\${${BackendSpringProperty.CLEAN_UP_RUN_EVERY_SECONDS}}", timeUnit = TimeUnit.SECONDS)
    fun task() {
        if (!taskLockService.acquireLock(
                CLEAN_UP_STALE_SEQUENCES_IN_PROCESSING_TASK_NAME,
                frequencyIntervalSeconds = runEverySeconds,
            )
        ) {
            return
        }
        try {
            log.info { "Cleaning up stale sequences in processing, timeToStaleInSeconds: $timeToStaleInSeconds" }
            submissionDatabaseService.cleanUpStaleSequencesInProcessing(timeToStaleInSeconds)
        } finally {
            taskLockService.releaseLock(
                CLEAN_UP_STALE_SEQUENCES_IN_PROCESSING_TASK_NAME,
                frequencyIntervalSeconds = runEverySeconds,
            )
        }
    }
}
