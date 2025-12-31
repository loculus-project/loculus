package org.loculus.backend.service.maintenance

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.service.files.FileId
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.files.S3Service
import org.loculus.backend.utils.DateProvider
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

private val log = mu.KotlinLogging.logger {}

@Component
class FileGarbageCollectorTask(
    private val filesDatabaseService: FilesDatabaseService,
    private val s3Service: S3Service,
    private val dateProvider: DateProvider,
    private val auditLogger: AuditLogger,
) {

    /**
     * Runs every 3 days and deletes orphaned files that are older than 7 days.
     * Orphaned files are files that are not referenced in any sequence entries or upload aux table.
     */
    @Scheduled(fixedDelay = 3, timeUnit = java.util.concurrent.TimeUnit.DAYS)
    fun task() {
        val dayCutoff = 7L
        val now = dateProvider.getCurrentInstant()
        val thresholdInstant = now.minus(
            dayCutoff,
            DateTimeUnit.DAY,
            DateProvider.timeZone,
        ).toLocalDateTime(DateProvider.timeZone)

        log.info { "Starting file garbage collection for files older than $dayCutoff days" }

        // Get all file IDs older than the threshold
        val oldFileIds = filesDatabaseService.getOldFileIds(thresholdInstant)
        if (oldFileIds.isEmpty()) {
            log.info { "No files older than $dayCutoff days found" }
            return
        }

        log.info { "Found ${oldFileIds.size} files older than $dayCutoff days" }

        // Get all referenced file IDs
        val referencedFileIds = filesDatabaseService.getReferencedFileIds()
        log.info { "Found ${referencedFileIds.size} referenced file IDs" }

        // Find orphaned files (old files that are not referenced)
        val orphanedFileIds = oldFileIds - referencedFileIds
        if (orphanedFileIds.isEmpty()) {
            log.info { "No orphaned files found" }
            return
        }

        log.info { "Found ${orphanedFileIds.size} orphaned files to delete" }

        // Delete files from S3 and database
        var deletedFromS3Count = 0
        orphanedFileIds.forEach { fileId ->
            try {
                s3Service.deleteFile(fileId)
                deletedFromS3Count++
            } catch (e: Exception) {
                log.warn(e) { "Failed to delete file from S3: $fileId" }
            }
        }

        // Delete file entries from database
        val deletedFromDbCount = filesDatabaseService.deleteFiles(orphanedFileIds)

        log.info {
            "File garbage collection completed: " +
                "deleted $deletedFromDbCount files from database, " +
                "$deletedFromS3Count files from S3"
        }
        auditLogger.log(
            "FILE_GARBAGE_COLLECTION",
            "Deleted $deletedFromDbCount orphaned file entries (older than $dayCutoff days) from database, " +
                "$deletedFromS3Count files from S3",
        )
    }
}
