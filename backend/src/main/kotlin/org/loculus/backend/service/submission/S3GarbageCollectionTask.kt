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
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlin.math.max

private val log = mu.KotlinLogging.logger {}

enum class S3GarbageCollectionMode {
    OFF,
    DRY_RUN,
    ON,
}

@Component
@ConditionalOnProperty("loculus.s3.enabled", havingValue = "true")
@ConditionalOnExpression("'${'$'}{${BackendSpringProperty.S3_GC_MODE}}' != 'OFF'")
class S3GarbageCollectionTask(
    private val filesDatabaseService: FilesDatabaseService,
    private val s3Service: S3Service,
    private val dateProvider: DateProvider,
    private val auditLogger: AuditLogger,
    @Value("\${${BackendSpringProperty.S3_ORPHAN_RETENTION_PERIOD_MINUTES}}")
    private val orphanRetentionPeriodMinutes: Int,
    @Value("\${${BackendSpringProperty.S3_GC_MODE}}") private val mode: S3GarbageCollectionMode,
) {

    /**
     * Deletes S3 objects older than `loculus.s3.orphan-retention-period-minutes` that are not referenced in
     * submitted_data or processed_data.
     */
    @Scheduled(
        initialDelayString = "\${${BackendSpringProperty.S3_GC_INITIAL_DELAY_MINUTES}}",
        fixedDelayString = "\${${BackendSpringProperty.S3_GC_POLLING_INTERVAL_MINUTES}}",
        timeUnit = TimeUnit.MINUTES,
    )
    fun task() {
        if (mode == S3GarbageCollectionMode.OFF) {
            return
        }

        // The retention period must be at least 1 minute or files produced by preprocessing may be
        // garbage collected before they're attached to sequence entries
        val retentionPeriodMinutes = max(orphanRetentionPeriodMinutes, 1)
        log.info {
            "Running S3 garbage collection task to clean up orphan files at least $retentionPeriodMinutes " +
                "minutes old (mode = $mode)"
        }

        val threshold = dateProvider.getCurrentInstant()
            .minus(retentionPeriodMinutes, DateTimeUnit.MINUTE, DateProvider.timeZone)
            .toLocalDateTime(DateProvider.timeZone)
        val orphans = filesDatabaseService.getOrphanedFileIds(threshold)

        if (mode == S3GarbageCollectionMode.DRY_RUN) {
            log.info { "S3 garbage collection task would have deleted ${orphans.size} files: $orphans" }
            return
        }

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
                    "submission after $retentionPeriodMinutes minutes"
            }
            auditLogger
                .log(
                    "CLEANUP",
                    "S3 garbage collection task deleted ${orphans.size - deleteFailures} orphan(s) " +
                        "not referenced by a submission after $retentionPeriodMinutes minutes",
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
