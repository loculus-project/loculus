package org.loculus.backend.controller.submission

import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectForbiddenResponse
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.jwtForDefaultUser
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class SubmitExternalDataEndpointTest(
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {

    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            submissionControllerClient.submitExternalData(
                PreparedExternalData.successfullySubmitted("DoesNotMatter"),
                jwt = it,
            )
        }
    }

    @Test
    fun `GIVEN authorization token with wrong role THEN returns 403 Forbidden`() {
        expectForbiddenResponse {
            submissionControllerClient.submitExternalData(
                PreparedExternalData.successfullySubmitted("DoesNotMatter"),
                jwt = jwtForDefaultUser,
            )
        }
    }

    @Test
    fun `GIVEN accessions are in status released THEN add external metadata`() {
        val accessions =
            convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease().map {
                it.accession
            }

        submissionControllerClient
            .submitExternalData(
                PreparedExternalData.successfullySubmitted(accession = accessions.first()),
            )
            .andExpect(status().isOk)

        // check that metadata is correct and that sub-table external_metadata_view is correct
    }

    @Test
    fun `GIVEN accessions are in status released THEN add external metadata from multiple sources`() {
        val accessions =
            convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease().map {
                it.accession
            }

        submissionControllerClient
            .submitExternalData(
                PreparedExternalData.successfullySubmitted(accession = accessions.first()),
            )
            .andExpect(status().isOk)

        // check that metadata is correct and that sub-table external_metadata_view is correct
    }

    private fun prepareExtractedSequencesInDatabase(
        numberOfSequenceEntries: Int = SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES,
        organism: String = DEFAULT_ORGANISM,
    ): List<UnprocessedData> {
        convenienceClient.submitDefaultFiles(organism = organism)
        return convenienceClient.extractUnprocessedData(
            numberOfSequenceEntries,
            organism = organism,
        )
    }

    @Test
    fun `GIVEN accessions are not yet in status released THEN do not allow submission`() {
        val accessions = prepareExtractedSequencesInDatabase().map { it.accession }

        submissionControllerClient
            .submitExternalData(
                PreparedExternalData.successfullySubmitted(accession = accessions.first()),
            )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail")
                    .value(
                        containsString(
                            (
                                "Accession versions are in not in one of the states " +
                                    "[APPROVED_FOR_RELEASE]: ${accessions.first()}"
                                ),
                        ),
                    ),
            )
    }

    @Test
    fun `GIVEN accessions do not exist THEN do not allow submission`() {
        val accession = "fake_accession"

        submissionControllerClient
            .submitExternalData(
                PreparedExternalData.successfullySubmitted(accession = accession),
            )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail")
                    .value(
                        containsString(
                            "Accession versions $accession.1 do not exist",
                        ),
                    ),
            )
    }
}
