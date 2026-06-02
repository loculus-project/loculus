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
import java.util.concurrent.TimeUnit

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
     * Runs once daily and deletes S3 objects older than `loculus.s3.orphan-file-max-age-days`
     * and are not referenced anywhere in original_data, unprocessed_data, or processed_data
     */
    @Scheduled(fixedDelay = 1, timeUnit = TimeUnit.DAYS)
    fun task() {
        val threshold = dateProvider.getCurrentInstant()
            .minus(maxOrphanAge, DateTimeUnit.DAY, DateProvider.timeZone)
            .toLocalDateTime(DateProvider.timeZone)
        val orphans = filesDatabaseService.getOrphanedFileIds(threshold)
        orphans.forEach { fileId ->
            s3Service.deleteFile(fileId)
            filesDatabaseService.deleteFileEntry(fileId)
        }

        if (orphans.isNotEmpty()) {
            log.info {
                "Deleted ${orphans.size} orphans that were not referenced by a submission after $maxOrphanAge days"
            }
            auditLogger
                .log(
                    "CLEANUP",
                    "Deleted ${orphans.size} orphans that were not referenced by a submission after $maxOrphanAge days",
                )
        }
    }
}
