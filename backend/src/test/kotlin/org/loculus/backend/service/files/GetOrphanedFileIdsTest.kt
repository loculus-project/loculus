package org.loculus.backend.service.files

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
import org.loculus.backend.service.files.daysAgo
import org.loculus.backend.service.files.insertFile
import org.loculus.backend.service.submission.UseNewerProcessingPipelineVersionTask
import org.springframework.beans.factory.annotation.Autowired
import java.util.UUID

/**
 * Testing of orphan file detection logic in [FilesDatabaseService.getOrphanedFileIds].
 */
@EndpointTest(
    properties = [
        // set to high value to prevent tests from triggering pipeline version upgrade task
        "${BackendSpringProperty.PIPELINE_VERSION_UPGRADE_CHECK_INTERVAL_SECONDS}=999999",
        "${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG",
    ],
)
class GetOrphanedFileIdsTest(
    @Autowired val filesDatabaseService: FilesDatabaseService,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val useNewerProcessingPipelineVersionTask: UseNewerProcessingPipelineVersionTask,
) {
    private var groupId = 0

    @BeforeEach
    fun createGroup() {
        groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
    }

    @Test
    fun `GIVEN unreferenced files THEN only those whose upload was requested before the threshold are orphaned`() {
        val old = UUID.randomUUID()
        val recent = UUID.randomUUID()
        insertFile(old, groupId, daysAgo(10))
        insertFile(recent, groupId, daysAgo(1))

        val orphans = filesDatabaseService.getOrphanedFileIds(daysAgo(5))

        assertThat(orphans, `is`(setOf(old)))
    }

    @Test
    fun `GIVEN multiple pipeline versions THEN files from all pipeline versions are protected`() {
        val fileFromOldPipeline = UUID.randomUUID()
        val fileFromCurrentPipeline = UUID.randomUUID()
        val fileFromNewerPipeline = UUID.randomUUID()
        listOf(fileFromOldPipeline, fileFromCurrentPipeline, fileFromNewerPipeline)
            .forEach { insertFile(it, groupId, daysAgo(10)) }

        val submissions = convenienceClient.submitDefaultFiles(groupId = groupId).submissionIdMappings
        val targetAccession = submissions.first().accession

        fun processedDataAtPipeline(file: UUID) = submissions.map { av ->
            if (av.accession == targetAccession) {
                PreparedProcessedData.withFiles(
                    av.accession,
                    mapOf("myFileCategory" to listOf(FileIdAndName(file, "output.txt"))),
                )
            } else {
                PreparedProcessedData.successfullyProcessed(av.accession)
            }
        }

        // The sequence entry itself references no files, so only the processed_data references matter.
        convenienceClient.extractUnprocessedData(pipelineVersion = 1)
        convenienceClient.submitProcessedData(processedDataAtPipeline(fileFromOldPipeline), pipelineVersion = 1)

        convenienceClient.extractUnprocessedData(pipelineVersion = 2)
        convenienceClient.submitProcessedData(processedDataAtPipeline(fileFromCurrentPipeline), pipelineVersion = 2)

        convenienceClient.extractUnprocessedData(pipelineVersion = 3)
        convenienceClient.submitProcessedData(processedDataAtPipeline(fileFromNewerPipeline), pipelineVersion = 3)

        assertThat(filesDatabaseService.getOrphanedFileIds(daysAgo(5)), `is`(emptySet()))
    }

    @Suppress("ktlint:standard:max-line-length")
    @Test
    fun `GIVEN a file only in preprocessed data of a pipeline version cleaned up after upgrade THEN it becomes orphaned`() {
        val fileInOldPipelineVersion = UUID.randomUUID()
        insertFile(fileInOldPipelineVersion, groupId, daysAgo(10))

        val submissions = convenienceClient.submitDefaultFiles(groupId = groupId).submissionIdMappings
        val targetAccession = submissions.first().accession

        fun processedData(includeFile: Boolean) = submissions.map { av ->
            if (av.accession == targetAccession && includeFile) {
                PreparedProcessedData.withFiles(
                    av.accession,
                    mapOf("myFileCategory" to listOf(FileIdAndName(fileInOldPipelineVersion, "output.txt"))),
                )
            } else {
                PreparedProcessedData.successfullyProcessed(av.accession)
            }
        }

        // v1: file is referenced in processed data
        convenienceClient.extractUnprocessedData(pipelineVersion = 1)
        convenienceClient.submitProcessedData(processedData(includeFile = true), pipelineVersion = 1)

        // v2 and v3: no file reference — all-good results trigger the upgrade task to advance to v3,
        // which causes v1 preprocessed data (the only reference to the file) to be cleaned up
        convenienceClient.extractUnprocessedData(pipelineVersion = 2)
        convenienceClient.submitProcessedData(processedData(includeFile = false), pipelineVersion = 2)
        convenienceClient.extractUnprocessedData(pipelineVersion = 3)
        convenienceClient.submitProcessedData(processedData(includeFile = false), pipelineVersion = 3)

        assertThat(filesDatabaseService.getOrphanedFileIds(daysAgo(5)), `is`(emptySet()))

        // Upgrades to v3, deletes v1 preprocessed data (keeps v2 as the one retained older version)
        useNewerProcessingPipelineVersionTask.task()

        assertThat(filesDatabaseService.getOrphanedFileIds(daysAgo(5)), `is`(setOf(fileInOldPipelineVersion)))
    }
}
