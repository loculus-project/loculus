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
    @Value("\${${BackendSpringProperty.S3_ORPHAN_RETENTION_PERIOD_MINUTES}}") private val orphanRetentionPeriod: Int,
    @Value("\${${BackendSpringProperty.S3_GC_ENABLED}:false}") private val enabled: Boolean = false,
) {

    /**
     * Runs once daily by default (with an initial delay of 15 minutes) and deletes S3 objects older than
     * `loculus.s3.orphan-retention-period-minutes` that are not referenced in submitted_data or processed_data.
     *
     * Uses a two-phase deletion approach to avoid a race condition where a file could be deleted
     * while a submission referencing it is in-flight:
     * - Phase 1: mark newly orphaned files as pending deletion (submissions referencing marked files are rejected)
     * - Phase 2: delete files that were already marked in a previous run and are still unreferenced
     */
    @Scheduled(
        initialDelayString = "\${${BackendSpringProperty.S3_GC_INITIAL_DELAY_MINUTES}:15}",
        fixedDelayString = "\${${BackendSpringProperty.S3_GC_FREQUENCY_MINUTES}:1440}",
        timeUnit = TimeUnit.MINUTES,
    )
    fun task() {
        // `orphanRetentionPeriod` should be long enough for files to not be garbage collected
        // before they're attached to sequence entries
        log.info {
            "Running S3 garbage collection task to clean up orphan files at least $orphanRetentionPeriod " +
                "minutes old (enabled = $enabled)"
        }

        val threshold = dateProvider.getCurrentInstant()
            .minus(orphanRetentionPeriod, DateTimeUnit.MINUTE, DateProvider.timeZone)
            .toLocalDateTime(DateProvider.timeZone)

        // Phase 2: delete files that were marked in a previous run and are still unreferenced
        val markedOrphans = filesDatabaseService.getMarkedOrphanedFileIds()
        if (enabled) {
            log.info {
                "S3 garbage collection task would have deleted ${markedOrphans.size} marked orphan(s): $markedOrphans"
            }
        } else {
            deleteFiles(markedOrphans, orphanRetentionPeriod)
        }

        // Phase 1: mark newly discovered orphans so they are rejected from submissions until the next run
        val newOrphans = filesDatabaseService.getOrphanedFileIds(threshold)
        if (enabled) {
            log.info {
                "S3 garbage collection task would have marked ${newOrphans.size} new orphan(s) for deletion: $newOrphans"
            }
        } else {
            if (newOrphans.isNotEmpty()) {
                filesDatabaseService.markFilesForDeletion(newOrphans)
                log.info { "S3 garbage collection task marked ${newOrphans.size} orphan(s) for deletion" }
            } else {
                log.info { "S3 garbage collection task identified no new orphan files" }
            }
        }
    }

    private fun deleteFiles(fileIds: Set<UUID>, orphanRetentionPeriod: Int) {
        var deleteFailures = 0
        fileIds.forEach { fileId ->
            try {
                s3Service.deleteFile(fileId)
                filesDatabaseService.deleteFileEntry(fileId)
            } catch (e: Exception) {
                log.warn("Failed to delete $fileId", e)
                deleteFailures++
            }
        }

        if (fileIds.isNotEmpty()) {
            log.info {
                "S3 garbage collection task deleted ${fileIds.size - deleteFailures} orphan(s) not referenced by a " +
                    "submission after $orphanRetentionPeriod minutes"
            }
            auditLogger.log(
                "CLEANUP",
                "S3 garbage collection task deleted ${fileIds.size - deleteFailures} orphan(s) " +
                    "not referenced by a submission after $orphanRetentionPeriod minutes",
            )
            if (deleteFailures > 0) {
                log.warn {
                    "S3 garbage collection task unsuccessfully attempted to delete $deleteFailures orphan file(s)"
                }
            }
        }
    }
}
