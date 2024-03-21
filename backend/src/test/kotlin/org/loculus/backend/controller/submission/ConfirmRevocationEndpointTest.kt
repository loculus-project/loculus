package org.loculus.backend.controller.submission

import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.Status.APPROVED_FOR_RELEASE
import org.loculus.backend.api.Status.AWAITING_APPROVAL
import org.loculus.backend.api.Status.AWAITING_APPROVAL_FOR_REVOCATION
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.getAccessionVersions
import org.loculus.backend.controller.toAccessionVersion
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
        val accessionVersions = convenienceClient.prepareDataTo(AWAITING_APPROVAL_FOR_REVOCATION).getAccessionVersions()

        client.confirmRevocation(accessionVersions)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntryOfUser(accession = accessionVersions.first().accession, version = 2)
            .assertStatusIs(APPROVED_FOR_RELEASE)
    }

    @Test
    fun `WHEN confirming revocation of non-existing accessionVersions THEN throws an unprocessableEntity error`() {
        convenienceClient.prepareDataTo(AWAITING_APPROVAL_FOR_REVOCATION)

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
            convenienceClient.prepareDataTo(AWAITING_APPROVAL_FOR_REVOCATION).first().toAccessionVersion()

        client.confirmRevocation(
            listOf(revokedAccessionVersion),
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
        val accessionVersions = convenienceClient
            .prepareDataTo(AWAITING_APPROVAL_FOR_REVOCATION, organism = DEFAULT_ORGANISM).getAccessionVersions()

        val notSubmitter = "notTheSubmitter"
        client.confirmRevocation(accessionVersions, jwt = generateJwtFor(notSubmitter))
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail", containsString("is not a member of group")),
            )
    }

    @Test
    fun `WHEN I confirm a revocation versions with latest version not 'APPROVED_FOR_RELEASE' THEN throws an error`() {
        val accessionVersions = convenienceClient
            .prepareDataTo(AWAITING_APPROVAL)
            .getAccessionVersions()

        val revocationAccessionVersions = convenienceClient
            .prepareDataTo(AWAITING_APPROVAL_FOR_REVOCATION)
            .getAccessionVersions()

        client.confirmRevocation(accessionVersions + revocationAccessionVersions)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString(
                        "Accession versions are in not in one of the states [" +
                            "${AWAITING_APPROVAL_FOR_REVOCATION.name}]: " +
                            "${accessionVersions.first().displayAccessionVersion()} - ${AWAITING_APPROVAL.name}",
                    ),
                ),
            )
    }
}
