package org.loculus.backend.service.submission

import org.loculus.backend.config.BackendSpringProperty
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

private val log = mu.KotlinLogging.logger {}

@Component
class CleanUpStaleSequencesInProcessingTask(
    private val submissionDatabaseService: SubmissionDatabaseService,
    @Value("\${${BackendSpringProperty.STALE_AFTER_SECONDS}}") private val timeToStaleInSeconds: Long,
) {
    @Scheduled(fixedRateString = "\${${BackendSpringProperty.CLEAN_UP_RUN_EVERY_SECONDS}}")
    fun task() {
        log.info { "Cleaning up stale sequences in processing, timeToStaleInSeconds: $timeToStaleInSeconds" }
        submissionDatabaseService.cleanUpStaleSequencesInProcessing(timeToStaleInSeconds)
    }
}
