package org.pathoplexus.backend.controller

import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.hasSize
import org.junit.jupiter.api.Test
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
import org.pathoplexus.backend.service.OriginalData
import org.pathoplexus.backend.service.UnprocessedData
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class ExtractUnprocessedDataEndpointTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val submissionControllerClient: SubmissionControllerClient,
) {

    @Test
    fun `GIVEN no sequences in database THEN returns empty response`() {
        val response = submissionControllerClient.extractUnprocessedData(DefaultFiles.NUMBER_OF_SEQUENCES)

        val responseBody = response.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody, `is`(emptyList()))
    }

    @Test
    fun `WHEN extracting unprocessed data THEN only previously not extracted sequences are returned`() {
        convenienceClient.submitDefaultFiles()

        val result7 = submissionControllerClient.extractUnprocessedData(7)
        val responseBody7 = result7.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody7, hasSize(7))
        assertThat(responseBody7[0].sequenceId, `is`(DefaultFiles.firstSequence))
        assertThat(responseBody7[0].version, `is`(1))
        assertThat(
            responseBody7[0].data,
            `is`(
                OriginalData(
                    mapOf(
                        "date" to "2020-12-26",
                        "host" to "Homo sapiens",
                        "region" to "Europe",
                        "country" to "Switzerland",
                        "division" to "Bern",
                    ),
                    mapOf("main" to "ACTG"),
                ),
            ),
        )

        val result3 = submissionControllerClient.extractUnprocessedData(5)
        val responseBody3 = result3.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody3, hasSize(3))
        assertThat(responseBody3[0].sequenceId, `is`(DefaultFiles.firstSequence + 7))

        val result0 = submissionControllerClient.extractUnprocessedData(DefaultFiles.NUMBER_OF_SEQUENCES)
        val responseBody0 = result0.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody0, `is`(emptyList()))
    }

    @Test
    fun `WHEN I want to extract more than allowed number of sequences at once THEN returns Bad Request`() {
        submissionControllerClient.extractUnprocessedData(100_001)
            .andExpect(status().isBadRequest)
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("You can extract at max 100000 sequences at once."),
                ),
            )
    }
}
