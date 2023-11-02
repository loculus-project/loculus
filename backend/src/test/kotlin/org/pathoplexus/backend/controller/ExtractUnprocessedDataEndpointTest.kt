package org.pathoplexus.backend.controller

import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.CoreMatchers.hasItem
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.hasSize
import org.junit.jupiter.api.Test
import org.pathoplexus.backend.api.Status.PROCESSING
import org.pathoplexus.backend.api.Status.REVIEWED
import org.pathoplexus.backend.api.UnprocessedData
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class ExtractUnprocessedDataEndpointTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val client: SubmissionControllerClient,
) {

    @Test
    fun `GIVEN no sequences in database THEN returns empty response`() {
        val response = client.extractUnprocessedData(DefaultFiles.NUMBER_OF_SEQUENCES)

        val responseBody = response.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody, `is`(emptyList()))
    }

    @Test
    fun `WHEN extracting unprocessed data THEN only previously not extracted sequences are returned`() {
        convenienceClient.submitDefaultFiles()

        val result7 = client.extractUnprocessedData(7)
        val responseBody7 = result7.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody7, hasSize(7))
        assertThat(
            responseBody7,
            hasItem(
                UnprocessedData(DefaultFiles.firstSequence, 1, defaultOriginalData),
            ),
        )

        val result3 = client.extractUnprocessedData(5)
        val responseBody3 = result3.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody3, hasSize(3))
        assertThat(responseBody3[0].sequenceId, `is`("8"))

        val result0 = client.extractUnprocessedData(DefaultFiles.NUMBER_OF_SEQUENCES)
        val responseBody0 = result0.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody0, `is`(emptyList()))
    }

    @Test
    fun `WHEN I want to extract more than allowed number of sequences at once THEN returns Bad Request`() {
        client.extractUnprocessedData(100_001)
            .andExpect(status().isBadRequest)
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("You can extract at max 100000 sequences at once."),
                ),
            )
    }

    @Test
    fun `GIVEN a sequence with status 'REVIEWED' THEN it should be returned and the status should change`() {
        convenienceClient.prepareDataTo(REVIEWED)

        val result = client.extractUnprocessedData(DefaultFiles.NUMBER_OF_SEQUENCES)
        val responseBody = result.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody, hasSize(10))
        assertThat(
            responseBody,
            hasItem(
                UnprocessedData(DefaultFiles.firstSequence, 1, defaultOriginalData),
            ),
        )

        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 1)
            .assertStatusIs(PROCESSING)
    }
}
