package org.loculus.backend.service.submission

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.files.S3Service
import org.loculus.backend.utils.DateProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlin.math.max

private val log = mu.KotlinLogging.logger {}

@Component
@ConditionalOnProperty("loculus.s3.enabled", havingValue = "true")
class S3GarbageCollectionTask(
    private val filesDatabaseService: FilesDatabaseService,
    private val s3Service: S3Service,
    private val dateProvider: DateProvider,
    private val auditLogger: AuditLogger,
    @Value("\${${BackendSpringProperty.S3_MAX_ORPHAN_AGE_DAYS}}") private val maxOrphanAge: Int,
) {

    /**
     * Runs once daily (with an initial delay of 15 minutes) and deletes S3 objects older than
     * `loculus.s3.orphan-file-max-age-days` that are not referenced in unprocessed_data or processed_data
     */
    @Scheduled(initialDelay = 90, fixedDelay = 5, timeUnit = TimeUnit.MINUTES)
    fun task() {
        log.info { "Running S3 garbage collection task" }

        // `maxOrphanAge` must be at least 1 or files produced by preprocessing will be
        // garbage collected mid-run before they're attached to sequence entries
        val maxOrphanAge = max(maxOrphanAge, 1)
        val threshold = dateProvider.getCurrentInstant()
            .minus(maxOrphanAge, DateTimeUnit.DAY, DateProvider.timeZone)
            .toLocalDateTime(DateProvider.timeZone)
        val orphans = filesDatabaseService.getOrphanedFileIds(threshold)

        var deleteFailures = 0
        orphans.forEach { fileId: UUID ->
            try {
                s3Service.deleteFile(fileId)
                filesDatabaseService.deleteFileEntry(fileId)
            } catch (e: Exception) {
                log.warn("Failed to delete $fileId", e)
                deleteFailures++
            }
        }

        if (orphans.isNotEmpty()) {
            log.info {
                "S3 garbage collection task deleted ${orphans.size - deleteFailures} orphan(s) not referenced by a " +
                    "submission after $maxOrphanAge days"
            }
            auditLogger
                .log(
                    "CLEANUP",
                    "S3 garbage collection task deleted ${orphans.size - deleteFailures} orphan(s) " +
                        "not referenced by a submission after $maxOrphanAge days",
                )

            if (deleteFailures > 0) {
                log.warn {
                    "S3 garbage collection task unsuccessfully attempted to delete $deleteFailures orphan file(s)"
                }
            }
        } else {
            log.info { "S3 garbage collection task identified no orphan files on S3" }
        }
    }
}
