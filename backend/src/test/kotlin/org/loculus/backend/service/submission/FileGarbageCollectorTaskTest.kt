package org.loculus.backend.service.maintenance

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.api.Organism
import org.loculus.backend.api.OriginalData
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.files.FilesTable
import org.loculus.backend.service.files.S3Service
import org.loculus.backend.service.submission.UploadDatabaseService
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.MetadataEntry
import org.springframework.beans.factory.annotation.Autowired
import java.util.UUID

@EndpointTest
class FileGarbageCollectorTaskTest(
    @Autowired val filesDatabaseService: FilesDatabaseService,
    @Autowired val uploadDatabaseService: UploadDatabaseService,
    @Autowired val dateProvider: DateProvider,
) {

    @Test
    fun `GIVEN old and recent files WHEN running GC THEN remove only old unreferenced files`() {
        val mockS3Service = mockk<S3Service>(relaxed = true)
        val fileGarbageCollectorTask = FileGarbageCollectorTask(
            filesDatabaseService,
            mockS3Service,
            dateProvider,
            mockk(relaxed = true),
        )

        val mockUser = mockk<AuthenticatedUser>()
        every { mockUser.username }.returns("username")
        val now = dateProvider.getCurrentInstant()

        // Create a recent file (6 days old) - should NOT be deleted
        val recentFileId = UUID.randomUUID()
        val sixDaysOld = now.minus(
            6,
            DateTimeUnit.DAY,
            DateProvider.timeZone,
        ).toLocalDateTime(DateProvider.timeZone)
        transaction {
            FilesTable.insert {
                it[idColumn] = recentFileId
                it[uploadRequestedAtColumn] = sixDaysOld
                it[uploaderColumn] = "username"
                it[groupIdColumn] = 1
            }
        }

        // Create an old unreferenced file (8 days old) - SHOULD be deleted
        val oldUnreferencedFileId = UUID.randomUUID()
        val eightDaysOld = now.minus(
            8,
            DateTimeUnit.DAY,
            DateProvider.timeZone,
        ).toLocalDateTime(DateProvider.timeZone)
        transaction {
            FilesTable.insert {
                it[idColumn] = oldUnreferencedFileId
                it[uploadRequestedAtColumn] = eightDaysOld
                it[uploaderColumn] = "username"
                it[groupIdColumn] = 1
            }
        }

        // Create an old referenced file (8 days old) - should NOT be deleted because it's referenced
        val oldReferencedFileId = UUID.randomUUID()
        transaction {
            FilesTable.insert {
                it[idColumn] = oldReferencedFileId
                it[uploadRequestedAtColumn] = eightDaysOld
                it[uploaderColumn] = "username"
                it[groupIdColumn] = 1
            }
        }

        // Add reference to oldReferencedFileId via metadata upload aux table
        val uploadId = "upload id"
        uploadDatabaseService.batchInsertMetadataInAuxTable(
            uploadId = uploadId,
            authenticatedUser = mockUser,
            groupId = 1,
            submittedOrganism = Organism("organism"),
            uploadedMetadataBatch = listOf(MetadataEntry("submission id", mapOf("key" to "value"))),
            uploadedAt = eightDaysOld,
            mapOf("submission id" to mapOf("test_category" to listOf(FileIdAndName(oldReferencedFileId, "test.txt")))),
        )

        // Verify initial state: 3 files exist
        transaction {
            val count = FilesTable.selectAll().count()
            assertThat(count, `is`(3L))
        }

        // Run garbage collection
        fileGarbageCollectorTask.task()

        // Verify final state: only 2 files remain (recent file and old referenced file)
        transaction {
            val count = FilesTable.selectAll().count()
            assertThat(count, `is`(2L))

            val remainingFileIds = FilesTable.selectAll().map { it[FilesTable.idColumn] }.toSet()
            assertThat(remainingFileIds.contains(recentFileId), `is`(true))
            assertThat(remainingFileIds.contains(oldReferencedFileId), `is`(true))
            assertThat(remainingFileIds.contains(oldUnreferencedFileId), `is`(false))
        }

        // Verify S3 deletion was called for the orphaned file
        verify(exactly = 1) { mockS3Service.deleteFile(oldUnreferencedFileId) }
    }
}
