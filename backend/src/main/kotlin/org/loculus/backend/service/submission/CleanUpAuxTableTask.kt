package org.loculus.backend.service.maintenance

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.service.scheduler.TaskLock
import org.loculus.backend.service.submission.UploadDatabaseService
import org.loculus.backend.utils.DateProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.TimeUnit

private val log = mu.KotlinLogging.logger {}

const val CLEAN_UP_AUX_TABLE_TASK_NAME = "clean-up-aux-table"

@Component
class CleanUpAuxTableTask(
    private val uploadDatabaseService: UploadDatabaseService,
    private val dateProvider: DateProvider,
    private val auditLogger: AuditLogger,
    @Value("\${${BackendSpringProperty.CLEAN_UP_AUX_TABLE_RUN_EVERY_HOURS}}")
    private val runEveryHours: Long,
) {

    /**
     * Scheduled to poll hourly; the task lock limits actual execution to at most once per [runEveryHours].
     * Deletes auxTable entries older than 24 hours.
     */
    @Scheduled(fixedDelay = 1, timeUnit = java.util.concurrent.TimeUnit.HOURS)
    @TaskLock(
        name = CLEAN_UP_AUX_TABLE_TASK_NAME,
        intervalString = "\${${BackendSpringProperty.CLEAN_UP_AUX_TABLE_RUN_EVERY_HOURS}}",
        timeUnit = TimeUnit.HOURS,
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
