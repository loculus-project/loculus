package org.loculus.backend.service.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.submission.PreparedProcessedData
import org.loculus.backend.controller.submission.SubmissionControllerClient
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class UseNewerProcessingPipelineVersionTaskTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val useNewerProcessingPipelineVersionTask: UseNewerProcessingPipelineVersionTask,
    @Autowired val submissionDatabaseService: SubmissionDatabaseService,
) {

    @Test
    fun `GIVEN error-free data from a newer pipeline WHEN the task is executed THEN the newer pipeline is used`() {
        assertThat(submissionDatabaseService.getCurrentProcessingPipelineVersion(), `is`(1L))
        val accessionVersions = convenienceClient.submitDefaultFiles().submissionIdMappings

        val processedData = accessionVersions.map {
            PreparedProcessedData.successfullyProcessed(it.accession, it.version)
        }
        
        val processedDataWithError = processedData.toMutableList()
        processedDataWithError[1] = PreparedProcessedData.withErrors(processedDataWithError[1].accession)

        convenienceClient.extractUnprocessedData(pipelineVersion = 1)
        convenienceClient.submitProcessedData(processedData, pipelineVersion = 1)
        useNewerProcessingPipelineVersionTask.task()
        assertThat(submissionDatabaseService.getCurrentProcessingPipelineVersion(), `is`(1L))

        convenienceClient.extractUnprocessedData(pipelineVersion = 2)
        convenienceClient.submitProcessedData(processedDataWithError, pipelineVersion = 2)
        useNewerProcessingPipelineVersionTask.task()
        assertThat(submissionDatabaseService.getCurrentProcessingPipelineVersion(), `is`(1L))

        convenienceClient.extractUnprocessedData(pipelineVersion = 3)
        convenienceClient.submitProcessedData(processedData, pipelineVersion = 3)
        useNewerProcessingPipelineVersionTask.task()
        assertThat(submissionDatabaseService.getCurrentProcessingPipelineVersion(), `is`(3L))

        submissionControllerClient.extractUnprocessedData(numberOfSequenceEntries = 10, pipelineVersion = 2)
            .andExpect(status().isUnprocessableEntity)
    }
}
