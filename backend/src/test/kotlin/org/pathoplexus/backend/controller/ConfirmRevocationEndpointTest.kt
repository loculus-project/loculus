package org.pathoplexus.backend.controller

import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.pathoplexus.backend.api.AccessionVersion
import org.pathoplexus.backend.api.Status.APPROVED_FOR_RELEASE
import org.pathoplexus.backend.api.Status.AWAITING_APPROVAL_FOR_REVOCATION
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class ConfirmRevocationEndpointTest(
    @Autowired val client: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {

    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            client.confirmRevocation(
                emptyList(),
                jwt = it,
            )
        }
    }

    @Test
    fun `GIVEN sequence entries with status 'FOR_REVOCATION' THEN the status changes to 'APPROVED_FOR_RELEASE'`() {
        convenienceClient.prepareDefaultSequenceEntriesToAwaitingApprovalForRevocation()

        client.confirmRevocation(
            listOf(
                AccessionVersion("1", 2),
                AccessionVersion("2", 2),
            ),
        )
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntryOfUser(accession = "1", version = 2)
            .assertStatusIs(APPROVED_FOR_RELEASE)
        convenienceClient.getSequenceEntryOfUser(accession = "2", version = 2)
            .assertStatusIs(APPROVED_FOR_RELEASE)
    }

    @Test
    fun `WHEN confirming revocation of non-existing accessionVersions THEN throws an unprocessableEntity error`() {
        convenienceClient.prepareDefaultSequenceEntriesToAwaitingApprovalForRevocation()

        val nonExistingAccession = AccessionVersion("123", 2)
        val nonExistingVersion = AccessionVersion("1", 123)

        client.confirmRevocation(listOf(nonExistingAccession, nonExistingVersion))
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail", containsString("Accession versions 1.123, 123.2 do not exist")),
            )
    }

    @Test
    fun `WHEN confirming revocation of other organism THEN throws an unprocessableEntity error`() {
        val revokedAccessionVersion =
            convenienceClient.prepareDataTo(AWAITING_APPROVAL_FOR_REVOCATION, organism = DEFAULT_ORGANISM)[0]

        client.confirmRevocation(
            listOf(revokedAccessionVersion.toAccessionVersion()),
            organism = OTHER_ORGANISM,
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail", containsString("accession versions are not of organism $OTHER_ORGANISM:")),
            )
    }

    @Test
    fun `WHEN confirming revocation for accessionVersions not from the submitter THEN throws forbidden error`() {
        convenienceClient.prepareDefaultSequenceEntriesToAwaitingApprovalForRevocation()

        val notSubmitter = "notTheSubmitter"
        client.confirmRevocation(
            listOf(
                AccessionVersion("1", 2),
                AccessionVersion("2", 2),
            ),
            jwt = generateJwtForUser(notSubmitter),
        )
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User '$notSubmitter' does not have right to change the accession versions " +
                        "1.2, 2.2",
                ),
            )
    }

    @Test
    fun `WHEN I confirm a revocation versions with latest version not 'APPROVED_FOR_RELEASE' THEN throws an error`() {
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()

        client.confirmRevocation(
            listOf(
                AccessionVersion("1", 1),
                AccessionVersion("2", 1),
            ),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession versions are in not in one of the states [" +
                        "${AWAITING_APPROVAL_FOR_REVOCATION.name}]: " +
                        "1.1 - ${APPROVED_FOR_RELEASE.name}, 2.1 - ${APPROVED_FOR_RELEASE.name}",
                ),
            )
    }
}
