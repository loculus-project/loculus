package org.loculus.backend.service.maintenance

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.service.scheduler.TaskLockServiceFactory
import org.loculus.backend.service.submission.UploadDatabaseService
import org.loculus.backend.utils.DateProvider
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.TimeUnit

private val log = mu.KotlinLogging.logger {}

@Component
class CleanUpAuxTableTask(
    private val uploadDatabaseService: UploadDatabaseService,
    private val taskLockServiceFactory: TaskLockServiceFactory,
    private val dateProvider: DateProvider,
    private val auditLogger: AuditLogger,
) {

    /**
     * Runs every hour and deletes auxTable entries older than 24 hours.
     */
    @Scheduled(fixedDelay = 1, timeUnit = java.util.concurrent.TimeUnit.HOURS)
    fun task() {
        val taskLockService = taskLockServiceFactory.create(
            frequencyIntervalSeconds = TimeUnit.HOURS.toSeconds(
                System.getProperty(
                    "loculus.maintenance.clean-up-aux-table.run-every-hours",
                    "24",
                ).toLong(),
            ),
        )
        if (!taskLockService.acquireLock("clean-up-aux-table")) return
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
        taskLockService.releaseLock("clean-up-aux-table")
    }
}
