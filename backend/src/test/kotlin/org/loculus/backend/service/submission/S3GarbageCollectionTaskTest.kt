package org.loculus.backend.service.submission

import com.ninjasquad.springmockk.MockkBean
import io.mockk.verify
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.api.SubmittedData
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.service.daysAgo
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.files.S3Service
import org.loculus.backend.service.insertFile
import org.loculus.backend.utils.DateProvider
import org.springframework.beans.factory.annotation.Autowired
import java.util.UUID

@EndpointTest(
    properties = [
        "${BackendSpringProperty.S3_ENABLED}=true",
        "${BackendSpringProperty.S3_GC_ENABLED}=true",
        "${BackendSpringProperty.S3_ORPHAN_RETENTION_PERIOD_MINUTES}=1440",
    ],
)
class S3GarbageCollectionTaskTest(
    @Autowired val s3GarbageCollectionTask: S3GarbageCollectionTask,
    @Autowired val filesDatabaseService: FilesDatabaseService,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
    @Autowired val dateProvider: DateProvider,
    @Autowired val auditLogger: AuditLogger,
) {
    @MockkBean(relaxed = true)
    lateinit var s3Service: S3Service

    private var groupId = 0

    @BeforeEach
    fun setup() {
        groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
    }

    @Test
    fun `GIVEN dry run is enabled WHEN the task runs THEN the orphan is not deleted from S3 or the DB`() {
        val orphan = UUID.randomUUID()
        insertFile(orphan, groupId, daysAgo(2))

        s3GarbageCollectionTask.task()

        verify(exactly = 0) { s3Service.deleteFile(any()) }
        assertThat(filesDatabaseService.getNonExistentFileIds(setOf(orphan)), `is`(emptySet()))
    }

    @Test
    fun `GIVEN an orphaned file WHEN the task runs THEN the file is marked for deletion but not yet deleted`() {
        val orphan = UUID.randomUUID()
        insertFile(orphan, groupId, daysAgo(2))

        nonDryRunTask().task()

        verify(exactly = 0) { s3Service.deleteFile(any()) }
        assertThat(filesDatabaseService.getNonExistentFileIds(setOf(orphan)), `is`(emptySet()))
        assertThat(filesDatabaseService.getMarkedForDeletionFileIds(setOf(orphan)), `is`(setOf(orphan)))
    }

    @Test
    fun `GIVEN a file marked in a previous run WHEN the task runs again THEN the file is deleted`() {
        val orphan = UUID.randomUUID()
        insertFile(orphan, groupId, daysAgo(2))

        val task = nonDryRunTask()
        task.task() // phase 1: marks the file
        task.task() // phase 2: deletes it

        verify { s3Service.deleteFile(orphan) }
        assertThat(filesDatabaseService.getNonExistentFileIds(setOf(orphan)), `is`(setOf(orphan)))
    }

    @Suppress("ktlint:standard:max-line-length")
    @Test
    fun `GIVEN an orphan and a referenced file WHEN the task runs THEN only the orphan is marked and the referenced file is untouched`() {
        val orphan = UUID.randomUUID()
        val referenced = UUID.randomUUID()
        listOf(orphan, referenced).forEach { insertFile(it, groupId, daysAgo(2)) }

        insertSequenceEntry(accession = "A1", version = 1, fileId = referenced)

        val task = nonDryRunTask()
        task.task() // phase 1: marks orphan, skips referenced
        task.task() // phase 2: deletes orphan

        verify { s3Service.deleteFile(orphan) }
        verify(exactly = 0) { s3Service.deleteFile(referenced) }
        assertThat(
            filesDatabaseService.getNonExistentFileIds(setOf(orphan, referenced)),
            `is`(setOf(orphan)),
        )
    }

    @Suppress("ktlint:standard:max-line-length")
    @Test
    fun `GIVEN a file marked then referenced between runs WHEN the task runs again THEN the file is NOT deleted (race condition fix)`() {
        val file = UUID.randomUUID()
        insertFile(file, groupId, daysAgo(2))

        nonDryRunTask().task() // phase 1: marks the file

        // Simulate the race condition: a submission referencing this file commits
        // after the mark but before the next GC run's phase 2 check.
        insertSequenceEntry(accession = "B1", version = 1, fileId = file)

        nonDryRunTask().task() // phase 2: file is now referenced, must NOT be deleted

        verify(exactly = 0) { s3Service.deleteFile(any()) }
        assertThat(filesDatabaseService.getNonExistentFileIds(setOf(file)), `is`(emptySet()))
    }

    private fun nonDryRunTask() = S3GarbageCollectionTask(
        filesDatabaseService,
        s3Service,
        dateProvider,
        auditLogger,
        orphanRetentionPeriod = 1,
        enabled = true,
    )

    private fun insertSequenceEntry(accession: String, version: Long, fileId: UUID) = transaction {
        SequenceEntriesTable.insert {
            it[accessionColumn] = accession
            it[versionColumn] = version
            it[organismColumn] = DEFAULT_ORGANISM
            it[submissionIdColumn] = "submission-$accession"
            it[submitterColumn] = "testuser"
            it[groupIdColumn] = groupId
            it[submittedAtTimestampColumn] = dateProvider.getCurrentDateTime()
            it[submittedDataColumn] = SubmittedData(
                metadata = emptyMap(),
                unalignedNucleotideSequences = emptyMap(),
                files = mapOf("rawReads" to listOf(FileIdAndName(fileId, "raw.fastq"))),
            )
        }
    }
}
