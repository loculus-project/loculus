package org.loculus.backend.service.submission

import com.ninjasquad.springmockk.MockkBean
import io.mockk.verify
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.api.OriginalData
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForDefaultUser
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
        "${BackendSpringProperty.S3_MAX_ORPHAN_AGE_DAYS}=0",
    ],
)
class S3GarbageCollectionTaskTest(
    @Autowired val s3GarbageCollectionTask: S3GarbageCollectionTask,
    @Autowired val filesDatabaseService: FilesDatabaseService,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
    @Autowired val dateProvider: DateProvider,
) {
    @MockkBean(relaxed = true)
    lateinit var s3Service: S3Service

    @Suppress("ktlint:standard:max-line-length")
    @Test
    fun `GIVEN an orphan and a referenced file WHEN the task runs THEN only the orphan is deleted from S3 and the DB`() {
        val groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
        val orphan = UUID.randomUUID()
        val referenced = UUID.randomUUID()
        listOf(orphan, referenced).forEach { insertFile(it, groupId, daysAgo(1)) }

        // `referenced` is referenced by a submission's unprocessed_data, so it must be protected.
        transaction {
            SequenceEntriesTable.insert {
                it[accessionColumn] = "A1"
                it[versionColumn] = 1
                it[organismColumn] = DEFAULT_ORGANISM
                it[submissionIdColumn] = "submission-A1"
                it[submitterColumn] = "testuser"
                it[groupIdColumn] = groupId
                it[submittedAtTimestampColumn] = dateProvider.getCurrentDateTime()
                it[unprocessedDataColumn] = OriginalData(
                    metadata = emptyMap(),
                    unalignedNucleotideSequences = emptyMap(),
                    files = mapOf("rawReads" to listOf(FileIdAndName(referenced, "raw.fastq"))),
                )
            }
        }

        s3GarbageCollectionTask.task()

        verify { s3Service.deleteFile(orphan) }
        verify(exactly = 0) { s3Service.deleteFile(referenced) }
        assertThat(
            filesDatabaseService.getNonExistentFileIds(setOf(orphan, referenced)),
            `is`(setOf(orphan)),
        )
    }
}
