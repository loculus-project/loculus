package org.loculus.backend.service.maintenance

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.service.submission.UploadDatabaseService
import org.loculus.backend.utils.DateProvider
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

private val log = mu.KotlinLogging.logger {}

@Component
class CleanUpAuxTableTask(
    private val uploadDatabaseService: UploadDatabaseService,
    private val dateProvider: DateProvider,
    private val auditLogger: AuditLogger,
) {

    /**
     * Deletes auxTable entries older than 24 hours.
     *
     * The scheduler polls frequently (every 5 minutes), but `lockAtLeastFor` keeps the ShedLock lock
     * held for at least the configured interval, so across replicas the task effectively runs once
     * per `lockAtLeastFor` regardless of replica count. `lockAtMostFor` is deliberately larger than
     * `lockAtLeastFor` so an unusually long run keeps the lock (no parallel run) while still releasing
     * within bounds if a replica dies mid-task.
     */
    @Scheduled(fixedDelay = 5, timeUnit = java.util.concurrent.TimeUnit.MINUTES)
    @SchedulerLock(
        name = "cleanUpAuxTable",
        lockAtLeastFor = "\${loculus.locks.cleanUpAuxTable.atLeast:PT1H}",
        lockAtMostFor = "PT6H",
    )
    fun task() {
        val hourCutoff = 24L
        val now = dateProvider.getCurrentInstant()
        val thresholdInstant = now.minus(
            hourCutoff,
            DateTimeUnit.HOUR,
            DateProvider.timeZone,
        ).toLocalDateTime(DateProvider.timeZone)
        val deletedCount = uploadDatabaseService.deleteAuxTableEntriesOlderThan(thresholdInstant)

        if (deletedCount > 0) {
            log.info { "Deleted $deletedCount auxTable entries older than $hourCutoff" }
            auditLogger.log("CLEANUP", "Deleted $deletedCount auxTable entries older than $hourCutoff hours.")
        }
    }
}
