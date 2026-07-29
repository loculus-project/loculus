package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.node.TextNode
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasEntry
import org.hamcrest.Matchers.notNullValue
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.Test
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.Status
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectForbiddenResponse
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.utils.Accession
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
            submissionControllerClient.submitExternalMetadata(
                PreparedExternalMetadata.successfullySubmitted("DoesNotMatter"),
                jwt = it,
            )
        }
    }

    @Test
    fun `GIVEN authorization token with wrong role THEN returns 403 Forbidden`() {
        expectForbiddenResponse {
            submissionControllerClient.submitExternalMetadata(
                PreparedExternalMetadata.successfullySubmitted("DoesNotMatter"),
                jwt = jwtForDefaultUser,
            )
        }
    }

    @Test
    fun `GIVEN accessions are in status released THEN add external metadata`() {
        val accession =
            convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease().map {
                it.accession
            }.first()

        submissionControllerClient
            .submitExternalMetadata(
                PreparedExternalMetadata.successfullySubmitted(accession = accession),
            )
            .andExpect(status().isNoContent)

        val releasedSequenceEntry = getReleasedSequenceEntry(accession)

        assertThat(releasedSequenceEntry.metadata, hasEntry("insdcAccessionFull", TextNode("GENBANK1000.1")))
    }

    @Test
    fun `GIVEN accessions are in status released THEN add external metadata from multiple sources`() {
        val accession =
            convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease().map {
                it.accession
            }.first()

        submissionControllerClient
            .submitExternalMetadata(
                PreparedExternalMetadata.successfullySubmitted(accession = accession),
            )
            .andExpect(status().isNoContent)

        submissionControllerClient
            .submitExternalMetadata(
                PreparedOtherExternalMetadata.successfullySubmitted(accession = accession),
                externalMetadataUpdater = "other_db",
            )
            .andExpect(status().isNoContent)

        val releasedSequenceEntry = getReleasedSequenceEntry(accession)

        assertThat(releasedSequenceEntry.metadata, hasEntry("insdcAccessionFull", TextNode("GENBANK1000.1")))
        assertThat(releasedSequenceEntry.metadata, hasEntry("other_db_accession", TextNode("DB1.1")))
        val filteredReleasedSequenceEntry = convenienceClient.getReleasedData(filterForEnaDeposition = "true")
            .find { it.metadata["accession"]?.textValue() == accession }
        assertThat(filteredReleasedSequenceEntry, nullValue())
    }

    @Test
    fun `WHEN I add a metadata field of another external updater THEN returns unprocessable entity`() {
        val accession = convenienceClient
            .prepareDefaultSequenceEntriesToApprovedForRelease()
            .map { it.accession }.first()

        val releasedSequenceEntryBefore = getReleasedSequenceEntry(accession)

        submissionControllerClient
            .submitExternalMetadata(
                PreparedExternalMetadata.successfullySubmitted(accession = accession),
                externalMetadataUpdater = "other_db",
            )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath("\$.detail")
                    .value(containsString("Unknown fields in metadata: insdcAccessionFull")),
            )

        val releasedSequenceEntryAfter = getReleasedSequenceEntry(accession)

        assertThat(releasedSequenceEntryBefore.metadata, equalTo(releasedSequenceEntryAfter.metadata))
    }

    @Test
    fun `GIVEN accessions are not yet in status released THEN do not allow submission`() {
        val accession = convenienceClient.prepareDataTo(Status.IN_PROCESSING).first().accession

        submissionControllerClient
            .submitExternalMetadata(
                PreparedExternalMetadata.successfullySubmitted(accession = accession),
            )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath("\$.detail")
                    .value(
                        containsString(
                            (
                                "Accession versions are not in one of the states " +
                                    "[APPROVED_FOR_RELEASE]: $accession"
                                ),
                        ),
                    ),
            )
    }

    @Test
    fun `GIVEN accessions do not exist THEN do not allow submission`() {
        val accession = "fake_accession"

        submissionControllerClient
            .submitExternalMetadata(
                PreparedExternalMetadata.successfullySubmitted(accession = accession),
            )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath("\$.detail")
                    .value(
                        containsString(
                            "Accession versions $accession.1 do not exist",
                        ),
                    ),
            )
    }

    private fun getReleasedSequenceEntry(accession: Accession): ProcessedData<GeneticSequence> {
        val releasedSequenceEntry = convenienceClient.getReleasedData()
            .find { it.metadata["accession"]?.textValue() == accession }

        assertThat(releasedSequenceEntry, notNullValue())
        return releasedSequenceEntry!!
    }
}
