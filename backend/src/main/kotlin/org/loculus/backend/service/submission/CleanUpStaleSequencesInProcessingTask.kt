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
    // `fixedDelay` (not `fixedRate`): schedules from completion, so the next poll always fires after
    // `lockAtLeastFor` (= run-every) has elapsed since acquisition. With `fixedRate` the poll grid would
    // sit exactly on the lock-expiry boundary and skip ticks unpredictably due to clock jitter.
    @Scheduled(
        fixedDelayString = "\${${BackendSpringProperty.CLEAN_UP_RUN_EVERY_SECONDS}}",
        timeUnit = TimeUnit.SECONDS,
    )
    @SchedulerLock(
        name = "cleanUpStaleSequencesInProcessing",
        // `lockAtLeastFor` enforces the effective run interval across replicas; it defaults to the
        // configured run-every interval so that value is honored rather than silently overridden.
        // `lockAtMostFor` (PT5M) is the crash-recovery ceiling. Overridable via `loculus.locks.*`
        // (tests set `atLeast` to PT0S).
        lockAtLeastFor = "\${loculus.locks.cleanUpStaleSequencesInProcessing.atLeast:" +
            "PT\${${BackendSpringProperty.CLEAN_UP_RUN_EVERY_SECONDS}}S}",
        lockAtMostFor = "PT5M",
    )
    fun task() {
        log.info { "Cleaning up stale sequences in processing, timeToStaleInSeconds: $timeToStaleInSeconds" }
        submissionDatabaseService.cleanUpStaleSequencesInProcessing(timeToStaleInSeconds)
    }
}
