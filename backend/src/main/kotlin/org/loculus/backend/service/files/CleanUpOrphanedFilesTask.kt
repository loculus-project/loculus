package org.loculus.backend.service.files

import mu.KotlinLogging
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.config.S3Config
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.TimeUnit

private val log = KotlinLogging.logger {}

@Component
class CleanUpOrphanedFilesTask(
    private val filesDatabaseService: FilesDatabaseService,
    private val s3Service: S3Service,
    private val s3Config: S3Config,
    @Value("\${${BackendSpringProperty.ORPHANED_FILE_CLEANUP_AFTER_SECONDS}}") private val deleteAfterSeconds: Long,
) {
    @Scheduled(
        fixedRateString = "\${${BackendSpringProperty.ORPHANED_FILE_CLEANUP_RUN_EVERY_SECONDS}}",
        timeUnit = TimeUnit.SECONDS,
    )
    fun task() {
        if (!s3Config.enabled) return

        val orphanedFileIds = filesDatabaseService.getOrphanedFileIds(deleteAfterSeconds)
        if (orphanedFileIds.isEmpty()) return

        log.info { "Cleaning up ${orphanedFileIds.size} orphaned file(s)" }
        for (fileId in orphanedFileIds) {
            try {
                s3Service.deleteObject(fileId)
                filesDatabaseService.deleteFileEntry(fileId)
            } catch (e: Exception) {
                log.warn { "Failed to delete orphaned file $fileId: ${e.message}" }
            }
        }
    }
}
