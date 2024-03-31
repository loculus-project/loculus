package org.loculus.backend.service.submission

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.submission.PreparedProcessedData
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class UseNewerProcessingPipelineVersionTaskTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val useNewerProcessingPipelineVersionTask: UseNewerProcessingPipelineVersionTask,
    @Autowired val submissionDatabaseService: SubmissionDatabaseService,
) {

    @Test
    fun `GIVEN error-free data from a newer pipeline WHEN the task is executed THEN the newer pipeline is used`() {
        assert(submissionDatabaseService.getCurrentProcessingPipelineVersion() == 1L)
        val accessionVersions = convenienceClient.submitDefaultFiles()

        val processedData = accessionVersions.map {
            PreparedProcessedData.successfullyProcessed(it.accession, it.version)
        }
        val processedDataWithError = processedData.toMutableList()
        processedDataWithError[1] = PreparedProcessedData.withErrors(processedDataWithError[1].accession)

        convenienceClient.extractUnprocessedData(pipelineVersion = 1)
        convenienceClient.submitProcessedData(processedData, pipelineVersion = 1)
        useNewerProcessingPipelineVersionTask.task()
        assert(submissionDatabaseService.getCurrentProcessingPipelineVersion() == 1L)

        convenienceClient.extractUnprocessedData(pipelineVersion = 2)
        convenienceClient.submitProcessedData(processedDataWithError, pipelineVersion = 2)
        useNewerProcessingPipelineVersionTask.task()
        assert(submissionDatabaseService.getCurrentProcessingPipelineVersion() == 1L)

        convenienceClient.extractUnprocessedData(pipelineVersion = 3)
        convenienceClient.submitProcessedData(processedData, pipelineVersion = 3)
        useNewerProcessingPipelineVersionTask.task()
        assert(submissionDatabaseService.getCurrentProcessingPipelineVersion() == 3L)

        val exception = assertThrows<AssertionError> {
            convenienceClient.extractUnprocessedData(pipelineVersion = 2)
        }
        assert(exception.message == "Status expected:<200> but was:<422>")
    }
}
