package org.loculus.backend.service.submission

import com.ninjasquad.springmockk.MockkBean
import io.mockk.verify
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.submission.PreparedProcessedData
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.files.S3Service
import org.loculus.backend.service.files.daysAgo
import org.loculus.backend.service.files.insertFile
import org.loculus.backend.utils.DateProvider
import org.springframework.beans.factory.annotation.Autowired
import java.util.UUID

@EndpointTest(
    properties = [
        "${BackendSpringProperty.S3_ENABLED}=true",
        "${BackendSpringProperty.S3_GC_ENABLED}=true",
        "${BackendSpringProperty.S3_ORPHAN_RETENTION_PERIOD_MINUTES}=1",
        "${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG",
    ],
)
class S3GarbageCollectionTaskTest(
    @Autowired val s3GarbageCollectionTask: S3GarbageCollectionTask,
    @Autowired val filesDatabaseService: FilesDatabaseService,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val dateProvider: DateProvider,
    @Autowired val auditLogger: AuditLogger,
) {
    @MockkBean(relaxed = true)
    lateinit var s3Service: S3Service

    private var groupId = 0

    private fun createProcessedSubmissionReferencingFile(file: UUID) {
        val submissions = convenienceClient.submitDefaultFiles(groupId = groupId).submissionIdMappings
        val targetAccession = submissions.first().accession

        convenienceClient.extractUnprocessedData()

        convenienceClient.submitProcessedData(
            submissions.map { av ->
                if (av.accession == targetAccession) {
                    PreparedProcessedData.withFiles(
                        av.accession,
                        mapOf("myFileCategory" to listOf(FileIdAndName(file, "output.txt"))),
                    )
                } else {
                    PreparedProcessedData.successfullyProcessed(av.accession)
                }
            },
        )
    }

    @BeforeEach
    fun setup() {
        groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
    }

    @Test
    fun `GIVEN GC is disabled WHEN the task runs THEN orphaned files are not deleted`() {
        val orphan = UUID.randomUUID()
        insertFile(orphan, groupId, daysAgo(2))

        S3GarbageCollectionTask(
            filesDatabaseService,
            s3Service,
            dateProvider,
            auditLogger,
            orphanRetentionPeriod = 1,
            enabled = false,
        ).task()

        verify(exactly = 0) { s3Service.deleteFile(any()) }
        assertThat(filesDatabaseService.getNonExistentFileIds(setOf(orphan)), `is`(emptySet()))
    }

    @Suppress("ktlint:standard:max-line-length")
    @Test
    fun `GIVEN an orphaned file WHEN the task runs once THEN the orphan is marked but not yet deleted from S3 or the DB`() {
        val orphan = UUID.randomUUID()
        insertFile(orphan, groupId, daysAgo(2))

        s3GarbageCollectionTask.task()

        verify(exactly = 0) { s3Service.deleteFile(any()) }
        assertThat(filesDatabaseService.getNonExistentFileIds(setOf(orphan)), `is`(emptySet()))
        assertThat(filesDatabaseService.getMarkedForDeletionFileIds(setOf(orphan)), `is`(setOf(orphan)))
    }

    @Test
    fun `GIVEN a file marked in a previous run WHEN the task runs again THEN the file is deleted`() {
        val orphan = UUID.randomUUID()
        insertFile(orphan, groupId, daysAgo(2))

        s3GarbageCollectionTask.task() // phase 1: marks the file
        s3GarbageCollectionTask.task() // phase 2: deletes it

        verify { s3Service.deleteFile(orphan) }
        assertThat(filesDatabaseService.getNonExistentFileIds(setOf(orphan)), `is`(setOf(orphan)))
    }

    @Suppress("ktlint:standard:max-line-length")
    @Test
    fun `GIVEN an orphan and a referenced file WHEN the task runs THEN only the orphan is marked and the referenced file is untouched`() {
        val orphan = UUID.randomUUID()
        val referenced = UUID.randomUUID()
        listOf(orphan, referenced).forEach { insertFile(it, groupId, daysAgo(2)) }

        createProcessedSubmissionReferencingFile(referenced)

        s3GarbageCollectionTask.task() // phase 1: marks orphan, skips referenced
        s3GarbageCollectionTask.task() // phase 2: deletes orphan

        verify { s3Service.deleteFile(orphan) }
        verify(exactly = 0) { s3Service.deleteFile(referenced) }
        assertThat(
            filesDatabaseService.getNonExistentFileIds(setOf(orphan, referenced)),
            `is`(setOf(orphan)),
        )
    }

    @Suppress("ktlint:standard:max-line-length")
    @Test
    fun `GIVEN a referenced file that is marked for deletion WHEN the task runs THEN the file is NOT deleted (race condition fix)`() {
        val file = UUID.randomUUID()
        insertFile(file, groupId, daysAgo(2))

        createProcessedSubmissionReferencingFile(file)

        // Simulate the race condition: GC phase 1 marked the file as an orphan (it was unreferenced at the
        // time), but a new submission referencing the file committed before phase 2 runs. We replicate this
        // by marking the file while it is already referenced. Phase 2 must re-check orphan status and skip
        // any file that now has a reference.
        filesDatabaseService.markFilesForDeletion(setOf(file))

        s3GarbageCollectionTask.task() // phase 2: file is marked but still referenced — must NOT be deleted

        verify(exactly = 0) { s3Service.deleteFile(any()) }
        assertThat(filesDatabaseService.getNonExistentFileIds(setOf(file)), `is`(emptySet()))
    }
}
