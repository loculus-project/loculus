package org.pathoplexus.backend.controller

import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.junit.jupiter.api.Test
import org.pathoplexus.backend.api.SequenceEntryReview
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles.firstAccession
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class GetDataToReviewEndpointTest(
    @Autowired val client: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {

    @Test
    fun `GIVEN an entry needs review WHEN I extract the sequence data THEN I get all data to review the entry`() {
        convenienceClient.prepareDefaultSequenceEntriesToInProcessing()

        client.submitProcessedData(PreparedProcessedData.withErrors())

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.HAS_ERRORS)

        val reviewData = convenienceClient.getSequenceEntryThatNeedsReview(
            accession = firstAccession,
            version = 1,
        )

        assertThat(reviewData.accession, `is`(firstAccession))
        assertThat(reviewData.version, `is`(1))
        assertThat(reviewData.processedData, `is`(PreparedProcessedData.withErrors().data))
    }

    @Test
    fun `WHEN I query data for a non-existent accession THEN refuses request with not found`() {
        val nonExistentAccession = "999"

        client.getSequenceEntryThatNeedsReview(nonExistentAccession, 1, USER_NAME)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession version $nonExistentAccession.1 does not exist",
                ),
            )
    }

    @Test
    fun `WHEN I query data for a non-existent accession version THEN refuses request with not found`() {
        val nonExistentAccessionVersion = 999L

        convenienceClient.prepareDefaultSequenceEntriesToHasErrors()

        client.getSequenceEntryThatNeedsReview("1", nonExistentAccessionVersion, USER_NAME)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession version 1.$nonExistentAccessionVersion does not exist",
                ),
            )
    }

    @Test
    fun `WHEN I query a sequence entry that has a wrong state THEN refuses request with unprocessable entity`() {
        convenienceClient.prepareDefaultSequenceEntriesToInProcessing()

        client.getSequenceEntryThatNeedsReview(
            accession = firstAccession,
            version = 1,
            userName = USER_NAME,
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession version 1.1 is in not in state HAS_ERRORS or AWAITING_APPROVAL (was IN_PROCESSING)",
                ),
            )
    }

    @Test
    fun `WHEN I try to get data for a sequence entry that I do not own THEN refuses request with forbidden entity`() {
        convenienceClient.prepareDefaultSequenceEntriesToHasErrors()

        val userNameThatDoesNotHavePermissionToQuery = "theOneWhoMustNotBeNamed"
        client.getSequenceEntryThatNeedsReview(
            accession = firstAccession,
            version = 1,
            userName = userNameThatDoesNotHavePermissionToQuery,
        )
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Sequence entry 1.1 is not owned by user $userNameThatDoesNotHavePermissionToQuery",
                ),
            )
    }

    @Test
    fun `WHEN I try to get batch data for sequence entries to review THEN I get the expected count back`() {
        convenienceClient.prepareDefaultSequenceEntriesToHasErrors()

        val numberOfReturnedSequenceReviews = client.getNumberOfSequenceEntriesThatNeedReview(
            USER_NAME,
            SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_NDJSON_VALUE))
            .expectNdjsonAndGetContent<SequenceEntryReview>().size
        assertThat(numberOfReturnedSequenceReviews, `is`(SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES))

        val userNameThatDoesNotHavePermissionToQuery = "theOneWhoMustNotBeNamed"
        val numberOfReturnedSequenceReviewsForAWrongUser = client.getNumberOfSequenceEntriesThatNeedReview(
            userNameThatDoesNotHavePermissionToQuery,
            SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_NDJSON_VALUE))
            .expectNdjsonAndGetContent<SequenceEntryReview>().size
        assertThat(numberOfReturnedSequenceReviewsForAWrongUser, `is`(0))
    }

    @Test
    fun `WHEN I want to get more than allowed number of review entries at once THEN returns Bad Request`() {
        client.extractUnprocessedData(100_001)
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("\$.detail", containsString("You can extract at max 100000 sequence entries at once.")))
    }
}
