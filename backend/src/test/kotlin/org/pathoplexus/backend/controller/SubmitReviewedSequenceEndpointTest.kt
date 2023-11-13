package org.pathoplexus.backend.controller

import org.junit.jupiter.api.Test
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.api.UnprocessedData
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles.firstAccession
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class SubmitReviewedSequenceEndpointTest(
    @Autowired val client: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {
    @Test
    fun `GIVEN a sequence entry needs review WHEN I submit reviewed data THEN the status changes to REVIEWED`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.withErrors())

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.HAS_ERRORS)

        val reviewedData = UnprocessedData(
            accession = "1",
            version = 1,
            data = emptyOriginalData,
        )
        client.submitReviewedSequenceEntry(USER_NAME, reviewedData)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.RECEIVED)
    }

    @Test
    fun `GIVEN a sequence entry is processed WHEN I submit a review THEN the status changes to REVIEWED`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.successfullyProcessed())

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.AWAITING_APPROVAL)

        val reviewedData = UnprocessedData(
            accession = "1",
            version = 1,
            data = emptyOriginalData,
        )

        client.submitReviewedSequenceEntry(USER_NAME, reviewedData)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.RECEIVED)
    }

    @Test
    fun `WHEN a version does not exist THEN it returns an unprocessable entity error`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.withErrors())

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.HAS_ERRORS)

        val reviewedDataWithNonExistingVersion =
            UnprocessedData(
                accession = "1",
                version = 2,
                data = emptyOriginalData,
            )
        val sequenceString = "${reviewedDataWithNonExistingVersion.accession}." +
            "${reviewedDataWithNonExistingVersion.version}"

        client.submitReviewedSequenceEntry(USER_NAME, reviewedDataWithNonExistingVersion)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath("\$.detail")
                    .value("Sequence entry $sequenceString does not exist"),
            )
    }

    @Test
    fun `WHEN an accession does not exist THEN it returns an unprocessable entity error`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.withErrors())

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.HAS_ERRORS)

        val reviewedDataWithNonExistingAccession = UnprocessedData(
            accession = "2",
            version = 1,
            data = emptyOriginalData,
        )
        val sequenceString = "${reviewedDataWithNonExistingAccession.accession}." +
            "${reviewedDataWithNonExistingAccession.version}"

        client.submitReviewedSequenceEntry(USER_NAME, reviewedDataWithNonExistingAccession)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath("\$.detail").value(
                    "Sequence entry $sequenceString is in status IN_PROCESSING, not in AWAITING_APPROVAL or HAS_ERRORS",
                ),
            )

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.HAS_ERRORS)
    }

    @Test
    fun `WHEN a sequence entry does not belong to a user THEN it returns an forbidden error`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.withErrors())

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.HAS_ERRORS)

        val reviewedDataFromWrongSubmitter =
            UnprocessedData(
                accession = "1",
                version = 1,
                data = emptyOriginalData,
            )
        val sequenceString = "${reviewedDataFromWrongSubmitter.accession}." +
            "${reviewedDataFromWrongSubmitter.version}"
        val nonExistingUser = "whoseNameMayNotBeMentioned"

        client.submitReviewedSequenceEntry(nonExistingUser, reviewedDataFromWrongSubmitter)
            .andExpect(status().isForbidden)
            .andExpect(
                jsonPath("\$.detail").value(
                    "Sequence entry $sequenceString is not owned by user $nonExistingUser",
                ),
            )

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.HAS_ERRORS)
    }
}
