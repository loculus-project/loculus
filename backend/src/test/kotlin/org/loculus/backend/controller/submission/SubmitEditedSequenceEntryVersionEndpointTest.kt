package org.loculus.backend.controller.submission

import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Status
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.controller.DEFAULT_GROUP_NAME
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.jwtForSuperUser
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
        val accessions = convenienceClient.prepareDataTo(Status.HAS_ERRORS).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.HAS_ERRORS)

        val editedData = generateUnprocessedData(accessions.first())
        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.RECEIVED)
    }

    @Test
    fun `GIVEN a sequence entry is processed WHEN I submit edited data THEN the status changes to RECEIVED`() {
        val accessions = convenienceClient.prepareDataTo(Status.AWAITING_APPROVAL).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.AWAITING_APPROVAL)

        val editedData = generateUnprocessedData(accessions.first())

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.RECEIVED)
    }

    @Test
    fun `WHEN a version does not exist THEN it returns an unprocessable entity error`() {
        val accessions = convenienceClient.prepareDataTo(Status.HAS_ERRORS).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.HAS_ERRORS)

        val editedDataWithNonExistingVersion = generateUnprocessedData(accessions.first(), version = 2)
        val sequenceString = editedDataWithNonExistingVersion.displayAccessionVersion()

        client.submitEditedSequenceEntryVersion(editedDataWithNonExistingVersion)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath("\$.detail")
                    .value("Accession versions $sequenceString do not exist"),
            )
    }

    @Test
    fun `WHEN an accession does not exist THEN it returns an unprocessable entity error`() {
        val accessions = convenienceClient.prepareDataTo(Status.HAS_ERRORS).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.HAS_ERRORS)

        val nonExistingAccession = "nonExistingAccession"

        val editedDataWithNonExistingAccession = generateUnprocessedData(nonExistingAccession)

        client.submitEditedSequenceEntryVersion(editedDataWithNonExistingAccession)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession versions $nonExistingAccession.1 do not exist",
                ),
            )

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.HAS_ERRORS)
    }

    @Test
    fun `WHEN submitting data for wrong organism THEN it returns an unprocessable entity error`() {
        val accessions = convenienceClient.prepareDataTo(Status.HAS_ERRORS).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.HAS_ERRORS)

        val editedData = generateUnprocessedData(accessions.first())

        client.submitEditedSequenceEntryVersion(editedData, organism = OTHER_ORGANISM)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("The following accession versions are not of organism"),
                ),
            )

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.HAS_ERRORS)
    }

    @Test
    fun `WHEN a sequence entry does not belong to a user THEN it returns an forbidden error`() {
        val accessions = convenienceClient.prepareDataTo(Status.HAS_ERRORS).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.HAS_ERRORS)

        val editedDataFromWrongSubmitter = generateUnprocessedData(accessions.first())
        val nonExistingUser = "whoseNameMayNotBeMentioned"

        client.submitEditedSequenceEntryVersion(editedDataFromWrongSubmitter, jwt = generateJwtFor(nonExistingUser))
            .andExpect(status().isForbidden)
            .andExpect(
                jsonPath("\$.detail", containsString("is not a member of group")),
            )

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.HAS_ERRORS)
    }

    @Test
    fun `WHEN superuser submits edited data for entry of other group THEN accepts data`() {
        val accessionVersion = convenienceClient
            .prepareDataTo(Status.HAS_ERRORS, username = DEFAULT_USER_NAME, groupName = DEFAULT_GROUP_NAME)
            .first()

        val editedData = generateUnprocessedData(accessionVersion.accession, accessionVersion.version)
        client.submitEditedSequenceEntryVersion(editedData, jwt = jwtForSuperUser)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessionVersion.accession, version = accessionVersion.version)
            .assertStatusIs(Status.RECEIVED)
    }

    private fun generateUnprocessedData(accession: String, version: Long = 1) = UnprocessedData(
        accession = accession,
        version = version,
        data = emptyOriginalData,
    )
}
