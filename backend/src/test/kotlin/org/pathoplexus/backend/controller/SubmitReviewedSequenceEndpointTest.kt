package org.pathoplexus.backend.controller

import org.junit.jupiter.api.Test
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles.firstSequence
import org.pathoplexus.backend.service.Status
import org.pathoplexus.backend.service.UnprocessedData
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class SubmitReviewedSequenceEndpointTest(
    @Autowired val client: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {
    @Test
    fun `GIVEN a sequence needs review WHEN I submit a reviewed sequence THEN the status changes to REVIEWED`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.withErrors())

        convenienceClient.getSequenceVersionOfUser(sequenceId = firstSequence, version = 1)
            .assertStatusIs(Status.NEEDS_REVIEW)

        val reviewedData = UnprocessedData(
            sequenceId = 1,
            version = 1,
            data = emptyOriginalData,
        )
        client.submitReviewedSequence(USER_NAME, reviewedData)
            .andExpect(status().isOk())

        convenienceClient.getSequenceVersionOfUser(sequenceId = firstSequence, version = 1)
            .assertStatusIs(Status.REVIEWED)
    }

    @Test
    fun `GIVEN a sequence is processed WHEN I submit a review to that sequence THEN the status changes to REVIEWED`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.successfullyProcessed())

        convenienceClient.getSequenceVersionOfUser(sequenceId = firstSequence, version = 1)
            .assertStatusIs(Status.PROCESSED)

        val reviewedData = UnprocessedData(
            sequenceId = 1,
            version = 1,
            data = emptyOriginalData,
        )

        client.submitReviewedSequence(USER_NAME, reviewedData)
            .andExpect(status().isOk())

        convenienceClient.getSequenceVersionOfUser(sequenceId = firstSequence, version = 1)
            .assertStatusIs(Status.REVIEWED)
    }

    @Test
    fun `WHEN a version does not exist THEN it returns an unprocessable entity error`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.withErrors())

        convenienceClient.getSequenceVersionOfUser(sequenceId = firstSequence, version = 1)
            .assertStatusIs(Status.NEEDS_REVIEW)

        val reviewedDataWithNonExistingVersion =
            UnprocessedData(
                sequenceId = 1,
                version = 2,
                data = emptyOriginalData,
            )
        val sequenceString = "${reviewedDataWithNonExistingVersion.sequenceId}." +
            "${reviewedDataWithNonExistingVersion.version}"

        client.submitReviewedSequence(USER_NAME, reviewedDataWithNonExistingVersion)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath("\$.detail")
                    .value("Sequence $sequenceString does not exist"),
            )
    }

    @Test
    fun `WHEN a sequenceId does not exist THEN it returns an unprocessable entity error`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.withErrors())

        convenienceClient.getSequenceVersionOfUser(sequenceId = firstSequence, version = 1)
            .assertStatusIs(Status.NEEDS_REVIEW)

        val reviewedDataWithNonExistingSequenceId = UnprocessedData(
            sequenceId = 2,
            version = 1,
            data = emptyOriginalData,
        )
        val sequenceString = "${reviewedDataWithNonExistingSequenceId.sequenceId}." +
            "${reviewedDataWithNonExistingSequenceId.version}"

        client.submitReviewedSequence(USER_NAME, reviewedDataWithNonExistingSequenceId)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath("\$.detail").value(
                    "Sequence $sequenceString is in status PROCESSING not in PROCESSED or NEEDS_REVIEW",
                ),
            )

        convenienceClient.getSequenceVersionOfUser(sequenceId = firstSequence, version = 1)
            .assertStatusIs(Status.NEEDS_REVIEW)
    }

    @Test
    fun `WHEN a sequenceId does not belong to a user THEN it returns an forbidden error`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.withErrors())

        convenienceClient.getSequenceVersionOfUser(sequenceId = firstSequence, version = 1)
            .assertStatusIs(Status.NEEDS_REVIEW)

        val reviewedDataFromWrongSubmitter =
            UnprocessedData(
                sequenceId = 1,
                version = 1,
                data = emptyOriginalData,
            )
        val sequenceString = "${reviewedDataFromWrongSubmitter.sequenceId}." +
            "${reviewedDataFromWrongSubmitter.version}"
        val nonExistingUser = "whoseNameMayNotBeMentioned"

        client.submitReviewedSequence(nonExistingUser, reviewedDataFromWrongSubmitter)
            .andExpect(status().isForbidden)
            .andExpect(
                jsonPath("\$.detail").value(
                    "Sequence $sequenceString is not owned by user $nonExistingUser",
                ),
            )

        convenienceClient.getSequenceVersionOfUser(sequenceId = firstSequence, version = 1)
            .assertStatusIs(Status.NEEDS_REVIEW)
    }
}
