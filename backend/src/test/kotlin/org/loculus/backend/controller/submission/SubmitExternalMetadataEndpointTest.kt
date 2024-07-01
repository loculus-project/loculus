package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.node.TextNode
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.hasEntry
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Status
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
class SubmitExternalMetadataEndpointTest(
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {

    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            submissionControllerClient.submitexternalMetadata(
                PreparedexternalMetadata.successfullySubmitted("DoesNotMatter"),
                jwt = it,
            )
        }
    }

    @Test
    fun `GIVEN authorization token with wrong role THEN returns 403 Forbidden`() {
        expectForbiddenResponse {
            submissionControllerClient.submitexternalMetadata(
                PreparedexternalMetadata.successfullySubmitted("DoesNotMatter"),
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
            .submitexternalMetadata(
                PreparedexternalMetadata.successfullySubmitted(accession = accessions.first()),
            )
            .andExpect(status().isNoContent)

        val releasedSequenceEntry = convenienceClient.getReleasedData()
            .find { it.metadata["accession"]?.textValue() == accessions.first() }

        assertThat(releasedSequenceEntry?.metadata, hasEntry("insdc_accession_full", TextNode("GENBANK1000.1")))
    }

    @Test
    fun `GIVEN accessions are in status released THEN add external metadata from multiple sources`() {
        val accessions =
            convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease().map {
                it.accession
            }

        submissionControllerClient
            .submitexternalMetadata(
                PreparedexternalMetadata.successfullySubmitted(accession = accessions.first()),
            )
            .andExpect(status().isNoContent)

        submissionControllerClient
            .submitexternalMetadata(
                PreparedOtherexternalMetadata.successfullySubmitted(accession = accessions.first()),
                externalMetadataUpdater = "other_db",
            )
            .andExpect(status().isNoContent)

        val releasedSequenceEntry = convenienceClient.getReleasedData()
            .find { it.metadata["accession"]?.textValue() == accessions.first() }

        assertThat(releasedSequenceEntry?.metadata, hasEntry("insdc_accession_full", TextNode("GENBANK1000.1")))
        assertThat(releasedSequenceEntry?.metadata, hasEntry("other_db_accession", TextNode("DB1.1")))
    }

    @Test
    fun `WHEN I add a metadata field of another external updater THEN returns unprocessable entity`() {
        val accessions = convenienceClient
            .prepareDefaultSequenceEntriesToApprovedForRelease()
            .map { it.accession }

        submissionControllerClient
            .submitexternalMetadata(
                PreparedexternalMetadata.successfullySubmitted(accession = accessions.first()),
                externalMetadataUpdater = "other_db",
            )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail")
                    .value(containsString("Unknown fields in metadata: insdc_accession_full")),
            )
    }

    @Test
    fun `GIVEN accessions are not yet in status released THEN do not allow submission`() {
        val accessions = convenienceClient.prepareDataTo(Status.IN_PROCESSING)

        submissionControllerClient
            .submitexternalMetadata(
                PreparedexternalMetadata.successfullySubmitted(accession = accessions.first().accession),
            )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail")
                    .value(
                        containsString(
                            (
                                "Accession versions are in not in one of the states " +
                                    "[APPROVED_FOR_RELEASE]: ${accessions.first().accession}"
                                ),
                        ),
                    ),
            )
    }

    @Test
    fun `GIVEN accessions do not exist THEN do not allow submission`() {
        val accession = "fake_accession"

        submissionControllerClient
            .submitexternalMetadata(
                PreparedexternalMetadata.successfullySubmitted(accession = accession),
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
