package org.loculus.backend.controller.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.anEmptyMap
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.`is`
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test
import org.loculus.backend.api.EditedSequenceEntryData
import org.loculus.backend.api.Status
import org.loculus.backend.controller.*
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
                generateEditedData("1"),
                jwt = it,
            )
        }
    }

    @Test
    fun `GIVEN a sequence entry has errors WHEN I submit edited data THEN the status changes to RECEIVED`() {
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED, errors = true).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
            .assertHasError()


        val editedData = generateEditedData(accessions.first())
        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.RECEIVED)
    }

    @Test
    fun `GIVEN a sequence entry is processed WHEN I submit edited data THEN the status changes to RECEIVED`() {
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)

        val editedData = generateEditedData(accessions.first())

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.RECEIVED)
    }

    @Test
    fun `GIVEN a sequence entry is processed WHEN I submit edited data THEN has changed original data`() {
        val firstAccession = convenienceClient.prepareDataTo(Status.PROCESSED)
            .map { it.accession }
            .first()

        val entryBeforeEdit = convenienceClient.getOriginalMetadata()
            .find { it.accession == firstAccession && it.version == 1L }!!
        assertThat(entryBeforeEdit.originalMetadata, `is`(not(anEmptyMap())))

        val editedData = generateEditedData(firstAccession)

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isNoContent)

        val entryAfterEdit = convenienceClient.getOriginalMetadata()
            .find { it.accession == firstAccession && it.version == 1L }!!
        assertThat(entryAfterEdit.originalMetadata, `is`(anEmptyMap()))
    }

    @Test
    fun `WHEN a version does not exist THEN it returns an unprocessable entity error`() {
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED, errors = true).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
            .assertHasError()

        val editedDataWithNonExistingVersion = generateEditedData(accessions.first(), version = 2)
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
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED, errors = true).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
            .assertHasError()

        val nonExistingAccession = "nonExistingAccession"

        val editedDataWithNonExistingAccession = generateEditedData(nonExistingAccession)

        client.submitEditedSequenceEntryVersion(editedDataWithNonExistingAccession)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession versions $nonExistingAccession.1 do not exist",
                ),
            )

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
            .assertHasError()
    }

    @Test
    fun `WHEN submitting data for wrong organism THEN it returns an unprocessable entity error`() {
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED, errors = true).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
            .assertHasError()

        val editedData = generateEditedData(accessions.first())

        client.submitEditedSequenceEntryVersion(editedData, organism = OTHER_ORGANISM)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("The following accession versions are not of organism"),
                ),
            )

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
            .assertHasError()
    }

    @Test
    fun `WHEN a sequence entry does not belong to a user THEN it returns an forbidden error`() {
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED, errors = true).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
            .assertHasError()

        val editedDataFromWrongSubmitter = generateEditedData(accessions.first())
        val nonExistingUser = "whoseNameMayNotBeMentioned"

        client.submitEditedSequenceEntryVersion(editedDataFromWrongSubmitter, jwt = generateJwtFor(nonExistingUser))
            .andExpect(status().isForbidden)
            .andExpect(
                jsonPath("\$.detail", containsString("is not a member of group")),
            )

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
            .assertHasError()
    }

    @Test
    fun `WHEN superuser submits edited data for entry of other group THEN accepts data`() {
        val accessionVersion = convenienceClient
            .prepareDataTo(Status.PROCESSED, errors = true, username = DEFAULT_USER_NAME)
            .first()

        val editedData = generateEditedData(accessionVersion.accession, accessionVersion.version)
        client.submitEditedSequenceEntryVersion(editedData, jwt = jwtForSuperUser)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessionVersion.accession, version = accessionVersion.version)
            .assertStatusIs(Status.RECEIVED)
    }

    private fun generateEditedData(accession: String, version: Long = 1) = EditedSequenceEntryData(
        accession = accession,
        version = version,
        data = emptyOriginalData,
    )
}
