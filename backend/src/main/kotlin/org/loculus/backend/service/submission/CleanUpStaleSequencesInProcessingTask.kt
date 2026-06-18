package org.loculus.backend.service.submission

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.loculus.backend.config.BackendSpringProperty
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.TimeUnit

private val log = mu.KotlinLogging.logger {}

@Component
class CleanUpStaleSequencesInProcessingTask(
    private val submissionDatabaseService: SubmissionDatabaseService,
    @Value("\${${BackendSpringProperty.STALE_AFTER_SECONDS}}") private val timeToStaleInSeconds: Long,
) {
    @Scheduled(fixedRateString = "\${${BackendSpringProperty.CLEAN_UP_RUN_EVERY_SECONDS}}", timeUnit = TimeUnit.SECONDS)
    @SchedulerLock(
        name = "cleanUpStaleSequencesInProcessing",
        // `lockAtLeastFor` enforces the effective run interval across replicas (default matches the
        // standard run-every interval); the lock is held this long even though the scheduler polls.
        lockAtLeastFor = "\${loculus.locks.cleanUpStaleSequencesInProcessing.atLeast:PT1M}",
        lockAtMostFor = "PT5M",
    )
    fun task() {
        log.info { "Cleaning up stale sequences in processing, timeToStaleInSeconds: $timeToStaleInSeconds" }
        submissionDatabaseService.cleanUpStaleSequencesInProcessing(timeToStaleInSeconds)
    }
}
