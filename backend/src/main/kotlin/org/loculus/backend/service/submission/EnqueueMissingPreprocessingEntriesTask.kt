package org.loculus.backend.service.submission

import java.util.concurrent.TimeUnit
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.service.scheduler.TaskLock
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

private val log = mu.KotlinLogging.logger {}

const val ENQUEUE_MISSING_PREPROCESSING_ENTRIES_TASK_NAME = "enqueue-missing-preprocessing-entries"

// Runs on startup and then periodically, since an older backend can keep accepting submissions
// until it is shut down at the end of a rolling deploy.
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
