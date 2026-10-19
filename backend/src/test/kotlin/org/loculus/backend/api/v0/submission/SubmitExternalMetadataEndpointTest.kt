package org.loculus.backend.api.v0.submission

import com.fasterxml.jackson.databind.node.TextNode
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasEntry
import org.hamcrest.Matchers.notNullValue
import org.junit.jupiter.api.Test
import org.loculus.backend.api.ExternalSubmittedData
import org.loculus.backend.testutil.EndpointTest
import org.loculus.backend.testutil.expectForbiddenResponse
import org.loculus.backend.testutil.expectUnauthorizedResponse
import org.loculus.backend.testutil.jwtForDefaultUser
import org.loculus.backend.types.GeneticSequence
import org.loculus.backend.types.ProcessedData
import org.loculus.backend.types.Status
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
            .andExpect(status().isUnprocessableContent)
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
            .andExpect(status().isUnprocessableContent)
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
            .andExpect(status().isUnprocessableContent)
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

    @Test
    fun `GIVEN accession-scoped external metadata THEN it applies to all versions including later revisions`() {
        val accession = convenienceClient
            .prepareDefaultSequenceEntriesToApprovedForRelease()
            .map { it.accession }.first()

        submissionControllerClient
            .submitExternalMetadata(
                PreparedExternalMetadata.successfullySubmitted(accession = accession, version = null),
            )
            .andExpect(status().isNoContent)

        convenienceClient.reviseAndProcessDefaultSequenceEntries(listOf(accession))

        val releasedVersions = getReleasedSequenceEntries(accession)
        assertThat(releasedVersions.keys, equalTo(setOf(1L, 2L)))
        releasedVersions.values.forEach {
            assertThat(it.metadata, hasEntry("insdcAccessionFull", TextNode("GENBANK1000.1")))
        }
    }

    @Test
    fun `GIVEN accession-scoped and version-scoped external metadata THEN version-scoped takes precedence`() {
        val accession = convenienceClient
            .prepareDefaultSequenceEntriesToApprovedForRelease()
            .map { it.accession }.first()
        convenienceClient.reviseAndProcessDefaultSequenceEntries(listOf(accession))

        submissionControllerClient
            .submitExternalMetadata(
                ExternalSubmittedData(
                    accession = accession,
                    version = null,
                    externalMetadata = mapOf("insdcAccessionFull" to TextNode("ACCESSION_SCOPED")),
                ),
                ExternalSubmittedData(
                    accession = accession,
                    version = 2,
                    externalMetadata = mapOf("insdcAccessionFull" to TextNode("VERSION_SCOPED")),
                ),
            )
            .andExpect(status().isNoContent)

        val releasedVersions = getReleasedSequenceEntries(accession)
        assertThat(
            releasedVersions[1L]!!.metadata,
            hasEntry("insdcAccessionFull", TextNode("ACCESSION_SCOPED")),
        )
        assertThat(
            releasedVersions[2L]!!.metadata,
            hasEntry("insdcAccessionFull", TextNode("VERSION_SCOPED")),
        )
    }

    @Test
    fun `GIVEN accession-scoped external metadata is resubmitted THEN it is overwritten`() {
        val accession = convenienceClient
            .prepareDefaultSequenceEntriesToApprovedForRelease()
            .map { it.accession }.first()

        listOf("FIRST", "SECOND").forEach { value ->
            submissionControllerClient
                .submitExternalMetadata(
                    ExternalSubmittedData(
                        accession = accession,
                        version = null,
                        externalMetadata = mapOf("insdcAccessionFull" to TextNode(value)),
                    ),
                )
                .andExpect(status().isNoContent)
        }

        assertThat(
            getReleasedSequenceEntry(accession).metadata,
            hasEntry("insdcAccessionFull", TextNode("SECOND")),
        )
    }

    @Test
    fun `GIVEN only an earlier version is released THEN allow accession-scoped submission`() {
        val accession = convenienceClient
            .prepareDefaultSequenceEntriesToApprovedForRelease()
            .map { it.accession }.first()
        convenienceClient.reviseDefaultProcessedSequenceEntries(listOf(accession))

        submissionControllerClient
            .submitExternalMetadata(
                PreparedExternalMetadata.successfullySubmitted(accession = accession, version = null),
            )
            .andExpect(status().isNoContent)

        assertThat(
            getReleasedSequenceEntry(accession).metadata,
            hasEntry("insdcAccessionFull", TextNode("GENBANK1000.1")),
        )
    }

    @Test
    fun `GIVEN no version of the accession is released THEN do not allow accession-scoped submission`() {
        val accession = convenienceClient.prepareDataTo(Status.IN_PROCESSING).first().accession

        submissionControllerClient
            .submitExternalMetadata(
                PreparedExternalMetadata.successfullySubmitted(accession = accession, version = null),
            )
            .andExpect(status().isUnprocessableContent)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath("\$.detail")
                    .value(containsString("Accession $accession has no version in status APPROVED_FOR_RELEASE")),
            )
    }

    @Test
    fun `GIVEN accession does not exist THEN do not allow accession-scoped submission`() {
        val accession = "fake_accession"

        submissionControllerClient
            .submitExternalMetadata(
                PreparedExternalMetadata.successfullySubmitted(accession = accession, version = null),
            )
            .andExpect(status().isUnprocessableContent)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath("\$.detail")
                    .value(containsString("Accessions $accession do not exist")),
            )
    }

    @Test
    fun `WHEN accession-scoped metadata has a field of another updater THEN returns unprocessable entity`() {
        val accession = convenienceClient
            .prepareDefaultSequenceEntriesToApprovedForRelease()
            .map { it.accession }.first()

        submissionControllerClient
            .submitExternalMetadata(
                PreparedExternalMetadata.successfullySubmitted(accession = accession, version = null),
                externalMetadataUpdater = "other_db",
            )
            .andExpect(status().isUnprocessableContent)
            .andExpect(
                jsonPath("\$.detail")
                    .value(containsString("Unknown fields in metadata: insdcAccessionFull")),
            )
    }

    private fun getReleasedSequenceEntries(accession: Accession): Map<Long, ProcessedData<GeneticSequence>> =
        convenienceClient.getReleasedData()
            .filter { it.metadata["accession"]?.textValue() == accession }
            .associateBy { it.metadata["version"]!!.asLong() }

    private fun getReleasedSequenceEntry(accession: Accession): ProcessedData<GeneticSequence> {
        val releasedSequenceEntry = convenienceClient.getReleasedData()
            .find { it.metadata["accession"]?.textValue() == accession }

        assertThat(releasedSequenceEntry, notNullValue())
        return releasedSequenceEntry!!
    }
}
