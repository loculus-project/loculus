package org.pathoplexus.backend.controller.submission

import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.api.Status.AWAITING_APPROVAL_FOR_REVOCATION
import org.pathoplexus.backend.controller.DEFAULT_ORGANISM
import org.pathoplexus.backend.controller.EndpointTest
import org.pathoplexus.backend.controller.OTHER_ORGANISM
import org.pathoplexus.backend.controller.assertStatusIs
import org.pathoplexus.backend.controller.expectUnauthorizedResponse
import org.pathoplexus.backend.controller.generateJwtFor
import org.pathoplexus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.pathoplexus.backend.controller.submission.SubmitFiles.DefaultFiles.firstAccession
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
    fun `GIVEN entries with 'APPROVED_FOR_RELEASE' THEN the status changes to 'AWAITING_APPROVAL_FOR_REVOCATION'`() {
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()

        client.revokeSequenceEntries(DefaultFiles.allAccessions)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(DefaultFiles.NUMBER_OF_SEQUENCES))
            .andExpect(jsonPath("\$[0].accession").value(DefaultFiles.firstAccession))
            .andExpect(jsonPath("\$[0].version").value(2))
            .andExpect(jsonPath("\$[0].status").value("AWAITING_APPROVAL_FOR_REVOCATION"))
            .andExpect(jsonPath("\$[0].isRevocation").value(true))

        convenienceClient.getSequenceEntryOfUser(accession = DefaultFiles.firstAccession, version = 2)
            .assertStatusIs(AWAITING_APPROVAL_FOR_REVOCATION)
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
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(organism = DEFAULT_ORGANISM)

        client.revokeSequenceEntries(listOf(firstAccession), organism = OTHER_ORGANISM)
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
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()

        val notSubmitter = "nonExistingUser"
        client.revokeSequenceEntries(DefaultFiles.allAccessions.subList(0, 2), jwt = generateJwtFor(notSubmitter))
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User '$notSubmitter' does not have right to change the accession versions " +
                        "1.1, 2.1",
                ),
            )
    }

    @Test
    fun `WHEN revoking with latest version not 'APPROVED_FOR_RELEASE' THEN throws an unprocessableEntity error`() {
        convenienceClient.prepareDefaultSequenceEntriesToHasErrors()

        client.revokeSequenceEntries(DefaultFiles.allAccessions.subList(0, 2))
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession versions are in not in one of the states [${Status.APPROVED_FOR_RELEASE}]: " +
                        "1.1 - ${Status.HAS_ERRORS}, 2.1 - ${Status.HAS_ERRORS}",
                ),
            )
    }
}
