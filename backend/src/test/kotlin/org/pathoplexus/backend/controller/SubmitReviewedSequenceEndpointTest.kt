package org.pathoplexus.backend.controller

import org.hamcrest.Matchers.containsString
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
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            client.submitReviewedSequenceEntry(
                generateUnprocessedData("1"),
                jwt = it,
            )
        }
    }

    @Test
    fun `GIVEN a sequence entry needs review WHEN I submit reviewed data THEN the status changes to REVIEWED`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.withErrors())

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.HAS_ERRORS)

        val reviewedData = generateUnprocessedData("1")
        client.submitReviewedSequenceEntry(reviewedData)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.RECEIVED)
    }

    @Test
    fun `GIVEN a sequence entry is processed WHEN I submit a review THEN the status changes to REVIEWED`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.successfullyProcessed())

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.AWAITING_APPROVAL)

        val reviewedData = generateUnprocessedData("1")

        client.submitReviewedSequenceEntry(reviewedData)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.RECEIVED)
    }

    @Test
    fun `WHEN a version does not exist THEN it returns an unprocessable entity error`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.withErrors())

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.HAS_ERRORS)

        val reviewedDataWithNonExistingVersion = generateUnprocessedData(firstAccession, version = 2)
        val sequenceString = getAccessionVersion(reviewedDataWithNonExistingVersion)

        client.submitReviewedSequenceEntry(reviewedDataWithNonExistingVersion)
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

        val reviewedDataWithNonExistingAccession = generateUnprocessedData("2")
        val sequenceString = getAccessionVersion(reviewedDataWithNonExistingAccession)

        client.submitReviewedSequenceEntry(reviewedDataWithNonExistingAccession)
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
    fun `WHEN submitting data for wrong organism THEN it returns an unprocessable entity error`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.withErrors())

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.HAS_ERRORS)

        val reviewedData = generateUnprocessedData(firstAccession)
        val sequenceString = getAccessionVersion(reviewedData)

        client.submitReviewedSequenceEntry(reviewedData, organism = OTHER_ORGANISM)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("Sequence entry $sequenceString is for organism $DEFAULT_ORGANISM"),
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

        val reviewedDataFromWrongSubmitter = generateUnprocessedData(firstAccession)
        val sequenceString = "${reviewedDataFromWrongSubmitter.accession}." +
            "${reviewedDataFromWrongSubmitter.version}"
        val nonExistingUser = "whoseNameMayNotBeMentioned"

        client.submitReviewedSequenceEntry(reviewedDataFromWrongSubmitter, jwt = generateJwtForUser(nonExistingUser))
            .andExpect(status().isForbidden)
            .andExpect(
                jsonPath("\$.detail").value(
                    "Sequence entry $sequenceString is not owned by user $nonExistingUser",
                ),
            )

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.HAS_ERRORS)
    }

    private fun generateUnprocessedData(accession: String, version: Long = 1) = UnprocessedData(
        accession = accession,
        version = version,
        data = emptyOriginalData,
    )

    private fun getAccessionVersion(unprocessedData: UnprocessedData) =
        "${unprocessedData.accession}.${unprocessedData.version}"
}
