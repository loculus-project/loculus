package org.loculus.backend.controller.submission

import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Status
import org.loculus.backend.api.Status.PROCESSED
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.jwtForSuperUser
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class RevokeEndpointTest(
    @Autowired val client: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {

    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            client.revokeSequenceEntries(
                emptyList(),
                jwt = it,
            )
        }
    }

    @Test
    fun `GIVEN entries with 'APPROVED_FOR_RELEASE' THEN returns revocation version in status AWAITING_APPROVAL`() {
        val accessions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease().map { it.accession }

        client.revokeSequenceEntries(accessions)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(DefaultFiles.NUMBER_OF_SEQUENCES))
            .andExpect(jsonPath("\$[0].accession").value(accessions.first()))
            .andExpect(jsonPath("\$[0].version").value(2))

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 2)
            .assertStatusIs(PROCESSED)
    }

    @Test
    fun `WHEN revoking non-existing accessions THEN throws an unprocessableEntity error`() {
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()

        val nonExistingAccession = "123"
        client.revokeSequenceEntries(listOf(nonExistingAccession))
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accessions $nonExistingAccession do not exist",
                ),
            )
    }

    @Test
    fun `WHEN revoking sequence entry of other organism THEN throws an unprocessableEntity error`() {
        val accessions = convenienceClient
            .prepareDefaultSequenceEntriesToApprovedForRelease(organism = DEFAULT_ORGANISM).map { it.accession }

        client.revokeSequenceEntries(listOf(accessions.first()), organism = OTHER_ORGANISM)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    containsString("accession versions are not of organism $OTHER_ORGANISM:"),
                ),
            )
    }

    @Test
    fun `WHEN revoking sequence entries not from the submitter THEN throws forbidden error`() {
        val accessions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease().map { it.accession }

        val notSubmitter = "nonExistingUser"
        client.revokeSequenceEntries(accessions, jwt = generateJwtFor(notSubmitter))
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail", containsString("is not a member of group")),
            )
    }

    @Test
    fun `WHEN superuser revokes entries of other group THEN revocation version is created`() {
        val accessions = convenienceClient
            .prepareDefaultSequenceEntriesToApprovedForRelease(username = DEFAULT_USER_NAME)
            .map { it.accession }

        client.revokeSequenceEntries(accessions, jwt = jwtForSuperUser)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(DefaultFiles.NUMBER_OF_SEQUENCES))
            .andExpect(jsonPath("\$[0].accession").value(accessions.first()))
            .andExpect(jsonPath("\$[0].version").value(2))

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 2)
            .assertStatusIs(PROCESSED)
    }

    @Test
    fun `WHEN revoking with latest version not 'APPROVED_FOR_RELEASE' THEN throws an unprocessableEntity error`() {
        val accessions = convenienceClient.prepareDefaultSequenceEntriesToHasErrors().map { it.accession }

        client.revokeSequenceEntries(accessions)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString(
                        "Accession versions are in not in one of the states [${Status.APPROVED_FOR_RELEASE}]: " +
                            "${accessions.first()}.1 - ${Status.PROCESSED},",
                    ),
                ),
            )
    }
}
