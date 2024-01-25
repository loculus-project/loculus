package org.loculus.backend.controller.submission

import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Status
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles.firstAccession
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class SubmitEditedSequenceEntryVersionEndpointTest(
    @Autowired val client: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {

    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            client.submitEditedSequenceEntryVersion(
                generateUnprocessedData("1"),
                jwt = it,
            )
        }
    }

    @Test
    fun `GIVEN a sequence entry has errors WHEN I submit edited data THEN the status changes to RECEIVED`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.withErrors())

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.HAS_ERRORS)

        val editedData = generateUnprocessedData("1")
        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.RECEIVED)
    }

    @Test
    fun `GIVEN a sequence entry is processed WHEN I submit edited data THEN the status changes to RECEIVED`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.successfullyProcessed())

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.AWAITING_APPROVAL)

        val editedData = generateUnprocessedData("1")

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.RECEIVED)
    }

    @Test
    fun `WHEN a version does not exist THEN it returns an unprocessable entity error`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.withErrors())

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.HAS_ERRORS)

        val editedDataWithNonExistingVersion = generateUnprocessedData(firstAccession, version = 2)
        val sequenceString = getAccessionVersion(editedDataWithNonExistingVersion)

        client.submitEditedSequenceEntryVersion(editedDataWithNonExistingVersion)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath("\$.detail")
                    .value("Accession versions $sequenceString do not exist"),
            )
    }

    @Test
    fun `WHEN an accession does not exist THEN it returns an unprocessable entity error`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.withErrors())

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.HAS_ERRORS)

        val editedDataWithNonExistingAccession = generateUnprocessedData("2")
        val sequenceString = getAccessionVersion(editedDataWithNonExistingAccession)

        client.submitEditedSequenceEntryVersion(editedDataWithNonExistingAccession)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession versions are in not in one of the states " +
                        "[AWAITING_APPROVAL, HAS_ERRORS]: $sequenceString - IN_PROCESSING",
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

        val editedData = generateUnprocessedData(firstAccession)

        client.submitEditedSequenceEntryVersion(editedData, organism = OTHER_ORGANISM)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("The following accession versions are not of organism"),
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

        val editedDataFromWrongSubmitter = generateUnprocessedData(firstAccession)
        val nonExistingUser = "whoseNameMayNotBeMentioned"

        client.submitEditedSequenceEntryVersion(editedDataFromWrongSubmitter, jwt = generateJwtFor(nonExistingUser))
            .andExpect(status().isForbidden)
            .andExpect(
                jsonPath("\$.detail", containsString("is not a member of the group")),
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
