package org.loculus.backend.service.submission

import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.service.scheduler.TaskLock
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.TimeUnit

private val log = mu.KotlinLogging.logger {}

const val ENQUEUE_MISSING_PREPROCESSING_ENTRIES_TASK_NAME = "enqueue-missing-preprocessing-entries"

// Runs on startup and periodically to recover submissions that missed a new queue's backfill.
@Component
class EnqueueMissingPreprocessingEntriesTask(private val submissionDatabaseService: SubmissionDatabaseService) {
    @Scheduled(
        initialDelay = 0,
        fixedDelayString = "\${${BackendSpringProperty.ENQUEUE_MISSING_PREPROCESSING_ENTRIES_EVERY_SECONDS}}",
        timeUnit = TimeUnit.SECONDS,
    )
    @TaskLock(
        name = ENQUEUE_MISSING_PREPROCESSING_ENTRIES_TASK_NAME,
        intervalString = "\${${BackendSpringProperty.ENQUEUE_MISSING_PREPROCESSING_ENTRIES_EVERY_SECONDS}}",
    )
    fun task() {
        log.info { "Queueing sequence entries missing from the preprocessing queue" }
        submissionDatabaseService.enqueueMissingPreprocessingEntries()
    }
}
