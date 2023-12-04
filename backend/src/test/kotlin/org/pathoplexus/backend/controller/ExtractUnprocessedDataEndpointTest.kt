package org.pathoplexus.backend.controller

import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.CoreMatchers.hasItem
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.hasSize
import org.junit.jupiter.api.Test
import org.pathoplexus.backend.api.Status.IN_PROCESSING
import org.pathoplexus.backend.api.Status.RECEIVED
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
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            client.extractUnprocessedData(
                1,
                jwt = it,
            )
        }
    }

    @Test
    fun `GIVEN authorization token with wrong role THEN returns 403 Forbidden`() {
        expectForbiddenResponse {
            client.extractUnprocessedData(
                1,
                jwt = jwtForDefaultUser,
            )
        }
    }

    @Test
    fun `GIVEN no sequence entries in database THEN returns empty response`() {
        val response = client.extractUnprocessedData(DefaultFiles.NUMBER_OF_SEQUENCES)

        val responseBody = response.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody, `is`(emptyList()))
    }

    @Test
    fun `WHEN extracting unprocessed data THEN only previously not extracted sequence entries are returned`() {
        convenienceClient.submitDefaultFiles()

        val result7 = client.extractUnprocessedData(7)
        val responseBody7 = result7.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody7, hasSize(7))
        assertThat(
            responseBody7,
            hasItem(
                UnprocessedData(DefaultFiles.firstAccession, 1, defaultOriginalData),
            ),
        )

        val result3 = client.extractUnprocessedData(5)
        val responseBody3 = result3.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody3, hasSize(3))
        assertThat(responseBody3[0].accession, `is`("8"))

        val result0 = client.extractUnprocessedData(DefaultFiles.NUMBER_OF_SEQUENCES)
        val responseBody0 = result0.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody0, `is`(emptyList()))
    }

    @Test
    fun `WHEN I want to extract more than allowed number of sequence entries at once THEN returns Bad Request`() {
        client.extractUnprocessedData(100_001)
            .andExpect(status().isBadRequest)
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("You can extract at max 100000 sequence entries at once."),
                ),
            )
    }

    @Test
    fun `GIVEN sequence entries for multiple organisms THEN it should only return entries for that organism`() {
        val defaultOrganismEntries = convenienceClient.submitDefaultFiles(organism = DEFAULT_ORGANISM)
        val otherOrganismEntries = convenienceClient.submitDefaultFiles(organism = OTHER_ORGANISM)

        val result = client.extractUnprocessedData(
            defaultOrganismEntries.size + otherOrganismEntries.size,
            organism = OTHER_ORGANISM,
        )
        val responseBody = result.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody, hasSize(otherOrganismEntries.size))

        convenienceClient.getSequenceEntryOfUser(
            accession = defaultOrganismEntries.first().accession,
            version = 1,
            organism = DEFAULT_ORGANISM,
        ).assertStatusIs(RECEIVED)
        convenienceClient.getSequenceEntryOfUser(
            accession = otherOrganismEntries.first().accession,
            version = 1,
            organism = OTHER_ORGANISM,
        ).assertStatusIs(IN_PROCESSING)

        assertThat(
            responseBody.getAccessionVersions(),
            containsInAnyOrder(*otherOrganismEntries.getAccessionVersions().toTypedArray()),
        )
        assertThat(
            defaultOrganismEntries.getAccessionVersions().intersect(responseBody.getAccessionVersions().toSet()),
            `is`(empty()),
        )
    }
}
