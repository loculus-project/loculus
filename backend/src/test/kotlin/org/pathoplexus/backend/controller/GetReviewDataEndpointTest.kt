package org.pathoplexus.backend.controller

import org.hamcrest.CoreMatchers
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.junit.jupiter.api.Test
import org.pathoplexus.backend.service.SequenceReview
import org.pathoplexus.backend.service.Status
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers

@EndpointTest
class GetReviewDataEndpointTest(
    @Autowired val client: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {

    @Test
    fun `GIVEN a sequence needs review WHEN I extract the sequence data THEN I get all data to review the sequence`() {
        convenienceClient.prepareDefaultSequencesToProcessing()

        client.submitProcessedData(PreparedProcessedData.withErrors())

        convenienceClient.getSequenceVersionOfUser(sequenceId = SubmitFiles.DefaultFiles.firstSequence, version = 1)
            .assertStatusIs(Status.NEEDS_REVIEW)

        val reviewData = convenienceClient.getSequenceThatNeedsReview(
            sequenceId = SubmitFiles.DefaultFiles.firstSequence,
            version = 1,
        )

        assertThat(reviewData.sequenceId, `is`(SubmitFiles.DefaultFiles.firstSequence))
        assertThat(reviewData.version, `is`(1))
        assertThat(reviewData.data, `is`(PreparedProcessedData.withErrors().data))
    }

    @Test
    fun `WHEN I query data for a non-existent sequence id THEN refuses request with not found`() {
        val nonExistentSequenceId = 999L

        client.getSequenceThatNeedsReview(nonExistentSequenceId, 1, USER_NAME)
            .andExpect(MockMvcResultMatchers.status().isNotFound)
            .andExpect(MockMvcResultMatchers.content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                MockMvcResultMatchers.jsonPath("\$.detail").value(
                    "Sequence version $nonExistentSequenceId.1 does not exist",
                ),
            )
    }

    @Test
    fun `WHEN I query data for a non-existent sequence version THEN refuses request with not found`() {
        val nonExistentSequenceVersion = 999L

        convenienceClient.prepareDefaultSequencesToNeedReview()

        client.getSequenceThatNeedsReview(1, nonExistentSequenceVersion, USER_NAME)
            .andExpect(MockMvcResultMatchers.status().isNotFound)
            .andExpect(MockMvcResultMatchers.content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                MockMvcResultMatchers.jsonPath("\$.detail").value(
                    "Sequence version 1.$nonExistentSequenceVersion does not exist",
                ),
            )
    }

    @Test
    fun `WHEN I query data for a sequence that has a wrong state THEN refuses request with unprocessable entity`() {
        convenienceClient.prepareDefaultSequencesToProcessing()

        client.getSequenceThatNeedsReview(
            sequenceId = SubmitFiles.DefaultFiles.firstSequence,
            version = 1,
            userName = USER_NAME,
        )
            .andExpect(MockMvcResultMatchers.status().isUnprocessableEntity)
            .andExpect(MockMvcResultMatchers.content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                MockMvcResultMatchers.jsonPath("\$.detail").value(
                    "Sequence version 1.1 is in not in state NEEDS_REVIEW or PROCESSED (was PROCESSING)",
                ),
            )
    }

    @Test
    fun `WHEN I try to get data for a sequence that I do not own THEN refuses request with forbidden entity`() {
        convenienceClient.prepareDefaultSequencesToNeedReview()

        val userNameThatDoesNotHavePermissionToQuery = "theOneWhoMustNotBeNamed"
        client.getSequenceThatNeedsReview(
            sequenceId = SubmitFiles.DefaultFiles.firstSequence,
            version = 1,
            userName = userNameThatDoesNotHavePermissionToQuery,
        )
            .andExpect(MockMvcResultMatchers.status().isForbidden)
            .andExpect(MockMvcResultMatchers.content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                MockMvcResultMatchers.jsonPath("\$.detail").value(
                    "Sequence 1.1 is not owned by user $userNameThatDoesNotHavePermissionToQuery",
                ),
            )
    }

    @Test
    fun `WHEN I try to get batch data for a sequence to review THEN I get the expected count back`() {
        convenienceClient.prepareDefaultSequencesToNeedReview()

        val numberOfReturnedSequenceReviews = client.getNumberOfSequencesThatNeedReview(
            USER_NAME,
            SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES,
        )
            .andExpect(MockMvcResultMatchers.status().isOk)
            .andExpect(MockMvcResultMatchers.content().contentType(MediaType.APPLICATION_NDJSON_VALUE))
            .expectNdjsonAndGetContent<SequenceReview>().size
        assertThat(numberOfReturnedSequenceReviews, `is`(SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES))

        val userNameThatDoesNotHavePermissionToQuery = "theOneWhoMustNotBeNamed"
        val numberOfReturnedSequenceReviewsForAWrongUser = client.getNumberOfSequencesThatNeedReview(
            userNameThatDoesNotHavePermissionToQuery,
            SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES,
        )
            .andExpect(MockMvcResultMatchers.status().isOk)
            .andExpect(MockMvcResultMatchers.content().contentType(MediaType.APPLICATION_NDJSON_VALUE))
            .expectNdjsonAndGetContent<SequenceReview>().size
        assertThat(numberOfReturnedSequenceReviewsForAWrongUser, `is`(0))
    }

    @Test
    fun `WHEN I want to get more than allowed number of review sequences at once THEN returns Bad Request`() {
        client.extractUnprocessedData(100_001)
            .andExpect(MockMvcResultMatchers.status().isBadRequest)
            .andExpect(
                MockMvcResultMatchers.jsonPath(
                    "\$.detail",
                    CoreMatchers.containsString("You can extract at max 100000 sequences at once."),
                ),
            )
    }
}
