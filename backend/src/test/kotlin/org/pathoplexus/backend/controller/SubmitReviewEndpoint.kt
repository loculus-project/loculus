package org.pathoplexus.backend.controller

import org.junit.jupiter.api.Test
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES
import org.pathoplexus.backend.service.Status
import org.pathoplexus.backend.service.UnprocessedData
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class SubmitReviewEndpoint(
    @Autowired val client: SubmissionControllerClient,
) {
    @Test
    fun `GIVEN a sequence needs review WHEN I submit a reviewed sequence THEN the status changes to REVIEWED`() {
        client.submitDefaultFiles()
        awaitResponse(client.extractUnprocessedData(NUMBER_OF_SEQUENCES).andReturn())

        client.submitProcessedData(processedInputDataFromFile("error_feedback"))

        expectStatusInResponse(
            client.getSequencesOfUser(),
            1,
            Status.NEEDS_REVIEW.name,
        )

        val reviewedData =
            UnprocessedData(
                sequenceId = 1,
                version = 1,
                data = emptyOriginalData,
            )

        client.submitReviewedSequence(USER_NAME, reviewedData)
            .andExpect(status().isOk())

        expectStatusInResponse(
            client.getSequencesOfUser(),
            1,
            Status.REVIEWED.name,
        )
    }

    @Test
    fun `GIVEN a sequence is processed WHEN I submit a review to that sequence THEN the status changes to REVIEWED`() {
        client.submitDefaultFiles()
        awaitResponse(client.extractUnprocessedData(NUMBER_OF_SEQUENCES).andReturn())

        client.submitProcessedData(processedInputDataFromFile("no_validation_errors"))

        expectStatusInResponse(
            client.getSequencesOfUser(),
            1,
            Status.PROCESSED.name,
        )

        val reviewedData =
            UnprocessedData(
                sequenceId = 1,
                version = 1,
                data = emptyOriginalData,
            )

        client.submitReviewedSequence(USER_NAME, reviewedData)
            .andExpect(status().isOk())

        expectStatusInResponse(
            client.getSequencesOfUser(),
            1,
            Status.REVIEWED.name,
        )
    }

    @Test
    fun `WHEN a version does not exist THEN it returns an unprocessable entity error`() {
        client.submitDefaultFiles()
        awaitResponse(client.extractUnprocessedData(NUMBER_OF_SEQUENCES).andReturn())

        client.submitProcessedData(processedInputDataFromFile("error_feedback"))

        expectStatusInResponse(
            client.getSequencesOfUser(),
            1,
            Status.NEEDS_REVIEW.name,
        )

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
        client.submitDefaultFiles()
        awaitResponse(client.extractUnprocessedData(NUMBER_OF_SEQUENCES).andReturn())

        client.submitProcessedData(processedInputDataFromFile("error_feedback"))

        expectStatusInResponse(
            client.getSequencesOfUser(),
            1,
            Status.NEEDS_REVIEW.name,
        )

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

        expectStatusInResponse(
            client.getSequencesOfUser(),
            0,
            Status.REVIEWED.name,
        )
    }

    @Test
    fun `WHEN a sequenceId does not belong to a user THEN it returns an forbidden error`() {
        client.submitDefaultFiles()
        awaitResponse(client.extractUnprocessedData(NUMBER_OF_SEQUENCES).andReturn())

        client.submitProcessedData(processedInputDataFromFile("error_feedback"))

        expectStatusInResponse(
            client.getSequencesOfUser(),
            1,
            Status.NEEDS_REVIEW.name,
        )

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

        expectStatusInResponse(
            client.getSequencesOfUser(),
            0,
            Status.REVIEWED.name,
        )
    }
}
