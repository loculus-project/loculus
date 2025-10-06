package org.loculus.backend.service.maintenance

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
     * Runs every hour and deletes auxTable entries older than 2 hours.
     */
    @Scheduled(fixedDelay = 1, timeUnit = java.util.concurrent.TimeUnit.HOURS)
    fun task() {
        val hourCutoff = 2L
        val thresholdDateTime = dateProvider.getCurrentDateTime().minusHours(hourCutoff)
        val deletedCount = uploadDatabaseService.deleteAuxTableEntriesOlderThan(thresholdDateTime)

        if (deletedCount > 0) {
            log.info { "Deleted $deletedCount auxTable entries older than $cutoff" }
            auditLogger.info("CLEANUP", "Deleted $deletedCount auxTable entries older than 2 hours.")
        }
    }
}
