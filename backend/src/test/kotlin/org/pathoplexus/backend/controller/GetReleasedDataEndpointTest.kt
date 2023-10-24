package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.TextNode
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.junit.jupiter.api.Test
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
import org.pathoplexus.backend.service.ProcessedData
import org.pathoplexus.backend.service.UnprocessedData
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class GetReleasedDataEndpointTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val objectMapper: ObjectMapper,
) {

    @Test
    fun `GIVEN no sequences in database THEN returns empty response`() {
        val response = submissionControllerClient.getReleasedData()

        val responseBody = response.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody, `is`(emptyList()))
    }

    @Test
    fun `GIVEN released data exists THEN returns it with additional metadata fields`() {
        convenienceClient.prepareDefaultSequencesToSiloReady()

        val response = submissionControllerClient.getReleasedData()

        val responseBody = response.expectNdjsonAndGetContent<ProcessedData>()

        assertThat(responseBody.size, `is`(DefaultFiles.NUMBER_OF_SEQUENCES))

        responseBody.forEach() {
            val id = it.metadata["sequenceId"]?.asLong()
            val version = it.metadata["version"]?.asLong()
            assertThat(version, `is`(1L))

            val expectedData = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata + mapOf(
                    "sequenceVersion" to TextNode("$id.$version"),
                    "isLatestVersion" to TextNode("true"),
                    "isRevocation" to TextNode("false"),
                    "submitter" to TextNode(USER_NAME),
                    "sequenceId" to TextNode("$id"),
                    "version" to TextNode("$version"),
                ),
            )

            assertThat(
                it,
                `is`(expectedData),
            )
        }
    }

    @Test
    fun `GIVEN released data exists in multiple versions THEN the 'isLatest' flag is set correctly`() {
        convenienceClient.prepareDefaultSequencesWithReleasedRevision()

        val response = submissionControllerClient.getReleasedData().expectNdjsonAndGetContent<ProcessedData>()

        assertThat(response.size, `is`(2 * DefaultFiles.NUMBER_OF_SEQUENCES))
        response.forEach() {
            if (it.metadata["version"]?.asLong() == 1L) {
                assertThat(it.metadata["isLatestVersion"]?.asText(), `is`("false"))
            } else {
                assertThat(it.metadata["isLatestVersion"]?.asText(), `is`("true"))
            }
        }
    }
}
