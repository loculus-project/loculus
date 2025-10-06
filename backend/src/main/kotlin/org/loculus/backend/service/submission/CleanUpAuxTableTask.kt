package org.loculus.backend.service.maintenance

import org.loculus.backend.log.AuditLogger
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Instant
import java.time.temporal.ChronoUnit

private val log = mu.KotlinLogging.logger {}

@Component
class CleanUpAuxTableTask(
    private val auxTableService: MetadataUploadAuxTable,
    private val auditLogger: AuditLogger,
) {

    /**
     * Runs every hour and deletes auxTable entries older than 2 hours.
     */
    @Scheduled(fixedDelay = 1, timeUnit = java.util.concurrent.TimeUnit.HOURS)
    fun task() {
        val cutoff = Instant.now().minus(2, ChronoUnit.HOURS)
        val deletedCount = auxTableService.deleteOlderThan(cutoff)

        if (deletedCount > 0) {
            log.info { "Deleted $deletedCount auxTable entries older than $cutoff" }
            auditLogger.info("CLEANUP", "Deleted $deletedCount auxTable entries older than 2 hours.")
        }
    }
}
