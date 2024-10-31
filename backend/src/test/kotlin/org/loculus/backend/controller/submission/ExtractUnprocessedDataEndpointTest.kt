package org.loculus.backend.controller.submission

import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.CoreMatchers.hasItem
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.allOf
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasProperty
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.matchesRegex
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Status.IN_PROCESSING
import org.loculus.backend.api.Status.RECEIVED
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.expectForbiddenResponse
import org.loculus.backend.controller.expectNdjsonAndGetContent
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.getAccessionVersions
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpHeaders.ETAG
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest(
    properties = ["${BackendSpringProperty.STREAM_BATCH_SIZE}=2"],
)
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
    fun `GIVEN header etag equal etag from last db update THEN respond with 304, ELSE respond with data and etag`() {
        val submissionResult = convenienceClient.submitDefaultFiles()
        val response = client.extractUnprocessedData(DefaultFiles.NUMBER_OF_SEQUENCES)

        val initialEtag = response.andReturn().response.getHeader(ETAG)

        val responseBody = response.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody.size, `is`(DefaultFiles.NUMBER_OF_SEQUENCES))

        val responseAfterUpdatingTable = client.extractUnprocessedData(
            DefaultFiles.NUMBER_OF_SEQUENCES,
            ifNoneMatch = initialEtag,
        ).andExpect(status().isOk)

        val emptyResponseBody = responseAfterUpdatingTable.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(emptyResponseBody.size, `is`(0))

        val secondEtag = responseAfterUpdatingTable.andReturn().response.getHeader(ETAG)

        val responseNoNewData = client.extractUnprocessedData(
            DefaultFiles.NUMBER_OF_SEQUENCES,
            ifNoneMatch = secondEtag,
        )

        responseNoNewData.andExpect(status().isNotModified)
            .andExpect(header().doesNotExist(ETAG))
    }

    @Test
    fun `WHEN extracting unprocessed data THEN only previously not extracted sequence entries are returned`() {
        val submissionResult = convenienceClient.submitDefaultFiles()
        val accessionVersions = submissionResult.submissionIdMappings

        val result7 = client.extractUnprocessedData(7)
        val responseBody7 = result7.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody7, hasSize(7))
        assertThat(
            responseBody7,
            hasItem(
                allOf(
                    hasProperty<UnprocessedData>("accession", `is`(accessionVersions[0].accession)),
                    hasProperty("version", `is`(1L)),
                    hasProperty("data", `is`(defaultOriginalData)),
                    hasProperty("submissionId", matchesRegex("custom[0-9]")),
                    hasProperty("submitter", `is`(DEFAULT_USER_NAME)),
                    hasProperty("groupId", `is`(submissionResult.groupId)),
                    hasProperty("submittedAt", greaterThan(1_700_000_000L)),
                ),
            ),
        )

        val result3 = client.extractUnprocessedData(5)
        val responseBody3 = result3.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody3, hasSize(3))
        assertThat(
            responseBody3,
            hasItem(hasProperty<UnprocessedData>("accession", `is`(accessionVersions[7].accession))),
        )

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
            .submissionIdMappings
        val otherOrganismEntries = convenienceClient.submitDefaultFiles(organism = OTHER_ORGANISM)
            .submissionIdMappings

        val result = client.extractUnprocessedData(
            defaultOrganismEntries.size + otherOrganismEntries.size,
            organism = OTHER_ORGANISM,
        )
        val responseBody = result.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody, hasSize(otherOrganismEntries.size))

        convenienceClient.getSequenceEntry(
            accession = defaultOrganismEntries.first().accession,
            version = 1,
            organism = DEFAULT_ORGANISM,
        ).assertStatusIs(RECEIVED)
        convenienceClient.getSequenceEntry(
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
