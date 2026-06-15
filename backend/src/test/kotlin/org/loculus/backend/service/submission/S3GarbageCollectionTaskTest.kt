package org.loculus.backend.service.submission

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.datetime.LocalDateTime
import org.junit.jupiter.api.Test
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.files.S3Service
import org.loculus.backend.utils.DateProvider
import java.util.UUID
import kotlin.time.Instant

class S3GarbageCollectionTaskTest {
    private val filesDatabaseService = mockk<FilesDatabaseService>(relaxed = true)
    private val s3Service = mockk<S3Service>(relaxed = true)
    private val dateProvider = mockk<DateProvider>()
    private val auditLogger = mockk<AuditLogger>(relaxed = true)

    @Test
    fun `GIVEN dry run is enabled THEN finds files at least one day old without deleting them`() {
        val orphan = UUID.randomUUID()
        givenOrphans(orphan)

        task(maxOrphanAge = 0, dryRun = true).task()

        verify { filesDatabaseService.getOrphanedFileIds(LocalDateTime.parse("2026-06-14T12:00:00")) }
        verify(exactly = 0) { s3Service.deleteFile(any()) }
        verify(exactly = 0) { filesDatabaseService.deleteFileEntry(any()) }
        verify(exactly = 0) { auditLogger.log(any(), any()) }
    }

    @Test
    fun `GIVEN orphans THEN deletes them from S3 and the database`() {
        val orphans = setOf(UUID.randomUUID(), UUID.randomUUID())
        givenOrphans(*orphans.toTypedArray())

        task().task()

        orphans.forEach {
            verify { s3Service.deleteFile(it) }
            verify { filesDatabaseService.deleteFileEntry(it) }
        }
        verify { auditLogger.log("CLEANUP", match { it.contains("deleted 2 orphan(s)") }) }
    }

    @Test
    fun `GIVEN deleting one orphan fails THEN continues deleting the others`() {
        val failed = UUID.randomUUID()
        val deleted = UUID.randomUUID()
        givenOrphans(failed, deleted)
        every { s3Service.deleteFile(failed) } throws RuntimeException("S3 unavailable")

        task().task()

        verify(exactly = 0) { filesDatabaseService.deleteFileEntry(failed) }
        verify { s3Service.deleteFile(deleted) }
        verify { filesDatabaseService.deleteFileEntry(deleted) }
        verify { auditLogger.log("CLEANUP", match { it.contains("deleted 1 orphan(s)") }) }
    }

    private fun givenOrphans(vararg orphans: UUID) {
        every { dateProvider.getCurrentInstant() } returns Instant.parse("2026-06-15T12:00:00Z")
        every { filesDatabaseService.getOrphanedFileIds(any()) } returns orphans.toSet()
    }

    private fun task(maxOrphanAge: Int = 1, dryRun: Boolean = false) = S3GarbageCollectionTask(
        filesDatabaseService,
        s3Service,
        dateProvider,
        auditLogger,
        maxOrphanAge,
        dryRun,
    )
}
