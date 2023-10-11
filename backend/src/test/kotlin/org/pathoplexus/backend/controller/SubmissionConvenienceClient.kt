package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.pathoplexus.backend.model.HeaderId
import org.pathoplexus.backend.service.SequenceReview
import org.pathoplexus.backend.service.SequenceVersionStatus
import org.pathoplexus.backend.service.SubmittedProcessedData
import org.pathoplexus.backend.service.UnprocessedData
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers

class SubmissionConvenienceClient(
    private val client: SubmissionControllerClient,
    private val objectMapper: ObjectMapper,
) {
    fun submitDefaultFiles(username: String = USER_NAME): List<HeaderId> {
        val submit = client.submit(
            username,
            SubmitFiles.DefaultFiles.metadataFile,
            SubmitFiles.DefaultFiles.sequencesFile,
        )

        return deserializeJsonResponse(submit)
    }

    fun prepareDefaultSequencesToProcessing() {
        submitDefaultFiles()
        awaitResponse(client.extractUnprocessedData(SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES).andReturn())
    }

    fun prepareDefaultSequencesToNeedReview() {
        prepareDefaultSequencesToProcessing()
        SubmitFiles.DefaultFiles.allSequenceIds.forEach { sequenceId ->
            client.submitProcessedData(PreparedProcessedData.withErrors(sequenceId = sequenceId))
        }
    }

    fun extractUnprocessedData(numberOfSequences: Int = SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES) =
        client.extractUnprocessedData(numberOfSequences)
            .expectNdjsonAndGetContent<UnprocessedData>()

    fun prepareDatabaseWith(
        vararg processedData: SubmittedProcessedData,
    ) {
        submitDefaultFiles()
        extractUnprocessedData()
        client.submitProcessedData(*processedData)
    }

    fun getSequencesOfUser(userName: String = USER_NAME): List<SequenceVersionStatus> {
        return deserializeJsonResponse(client.getSequencesOfUser(userName))
    }

    fun getSequenceVersionOfUser(
        sequenceId: Long,
        version: Long,
        userName: String = USER_NAME,
    ): SequenceVersionStatus {
        val sequencesOfUser = getSequencesOfUser(userName)

        return sequencesOfUser.find { it.sequenceId == sequenceId && it.version == version }
            ?: error("Did not find $sequenceId.$version for $userName")
    }

    fun getSequenceThatNeedsReview(
        sequenceId: Long,
        version: Long,
        userName: String = USER_NAME,
    ): SequenceReview =
        deserializeJsonResponse<SequenceReview>(client.getSequenceThatNeedsReview(sequenceId, version, userName))

    private inline fun <reified T> deserializeJsonResponse(resultActions: ResultActions): T {
        val content =
            resultActions
                .andExpect(MockMvcResultMatchers.status().isOk)
                .andExpect(MockMvcResultMatchers.content().contentType(MediaType.APPLICATION_JSON_VALUE))
                .andReturn()
                .response
                .contentAsString
        return objectMapper.readValue(content)
    }
}
