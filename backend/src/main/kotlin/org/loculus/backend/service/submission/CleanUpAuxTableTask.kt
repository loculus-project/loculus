package org.loculus.backend.service.maintenance

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
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
     * Runs every hour and deletes auxTable entries older than 24 hours.
     */
    @Scheduled(fixedDelay = 1, timeUnit = java.util.concurrent.TimeUnit.HOURS)
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
