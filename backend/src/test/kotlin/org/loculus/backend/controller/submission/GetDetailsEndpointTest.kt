package org.loculus.backend.controller.submission

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasSize
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.api.AccessionVersionWithOrganism
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectNdjsonAndGetContent
import org.loculus.backend.service.KeycloakAdapter
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class GetDetailsEndpointTest(
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val submissionControllerClient: SubmissionControllerClient,
) {
    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    @BeforeEach
    fun setup() {
        every { keycloakAdapter.getUsersWithName(any()) } returns listOf(UserRepresentation())
    }

    @Test
    fun `GIVEN no accessionOrAccessionVersions THEN returns 400`() {
        submissionControllerClient.getDetails()
            .andExpect(status().isBadRequest)
            .andExpect(
                content().string(
                    containsString("At least one accession or accession version must be provided."),
                ),
            )
    }

    @Test
    fun `GIVEN empty accessionOrAccessionVersions list THEN returns 400`() {
        submissionControllerClient.getDetails(accessionOrAccessionVersions = emptyList())
            .andExpect(status().isBadRequest)
            .andExpect(
                content().string(
                    containsString("At least one accession or accession version must be provided."),
                ),
            )
    }

    @Test
    fun `GIVEN entry without dot separator THEN treats it as bare accession`() {
        val result = submissionControllerClient.getDetails(accessionOrAccessionVersions = listOf("LOC_000S01D"))
            .expectNdjsonAndGetContent<AccessionVersionWithOrganism>()

        assertThat(result, `is`(empty()))
    }

    @Test
    fun `GIVEN entry with non-numeric version suffix THEN treats it as bare accession`() {
        val result = submissionControllerClient.getDetails(accessionOrAccessionVersions = listOf("LOC_000S01D.abc"))
            .expectNdjsonAndGetContent<AccessionVersionWithOrganism>()

        assertThat(result, `is`(empty()))
    }

    @Test
    fun `GIVEN entry with trailing dot THEN treats it as bare accession`() {
        val result = submissionControllerClient.getDetails(accessionOrAccessionVersions = listOf("LOC_000S01D."))
            .expectNdjsonAndGetContent<AccessionVersionWithOrganism>()

        assertThat(result, `is`(empty()))
    }

    @Test
    fun `GIVEN no matching accession in database THEN returns empty result`() {
        val result = submissionControllerClient.getDetails(accessionOrAccessionVersions = listOf("NONEXISTENT"))
            .expectNdjsonAndGetContent<AccessionVersionWithOrganism>()

        assertThat(result, `is`(empty()))
    }

    @Test
    fun `GIVEN unreleased sequence entry THEN does not return it`() {
        convenienceClient.prepareDefaultSequenceEntriesToInProcessing()

        val result = submissionControllerClient.getDetails(accessionOrAccessionVersions = listOf("LOC_000S01D"))
            .expectNdjsonAndGetContent<AccessionVersionWithOrganism>()

        assertThat(result, `is`(empty()))
    }

    @Test
    fun `GIVEN released data THEN returns it for a bare accession`() {
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val accession = accessionVersions.first().accession

        val result = submissionControllerClient.getDetails(accessionOrAccessionVersions = listOf(accession))
            .expectNdjsonAndGetContent<AccessionVersionWithOrganism>()

        assertThat(result, hasSize(1))
        assertThat(result[0].accession, `is`(accession))
        assertThat(result[0].version, `is`(1L))
        assertThat(result[0].organism, `is`(DEFAULT_ORGANISM))
        assertThat(result[0].isRevocation, `is`(false))
        assertThat(result[0].submittedAt, greaterThan(0L))
    }

    @Test
    fun `GIVEN released data with multiple versions THEN bare accession returns all versions`() {
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val allAccessions = accessionVersions.map { it.accession }
        val accession = allAccessions.first()
        convenienceClient.reviseAndProcessDefaultSequenceEntries(allAccessions)

        val result = submissionControllerClient.getDetails(accessionOrAccessionVersions = listOf(accession))
            .expectNdjsonAndGetContent<AccessionVersionWithOrganism>()

        assertThat(result, hasSize(2))
        assertThat(result[0].accession, `is`(accession))
        assertThat(result[0].version, `is`(1L))
        assertThat(result[1].accession, `is`(accession))
        assertThat(result[1].version, `is`(2L))
    }

    @Test
    fun `GIVEN released data with multiple versions THEN accession version returns only that version`() {
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val allAccessions = accessionVersions.map { it.accession }
        val accession = allAccessions.first()
        convenienceClient.reviseAndProcessDefaultSequenceEntries(allAccessions)

        val result = submissionControllerClient.getDetails(accessionOrAccessionVersions = listOf("$accession.1"))
            .expectNdjsonAndGetContent<AccessionVersionWithOrganism>()

        assertThat(result, hasSize(1))
        assertThat(result[0].accession, `is`(accession))
        assertThat(result[0].version, `is`(1L))
    }

    @Test
    fun `GIVEN mix of bare accessions and accession versions THEN returns correct combined results`() {
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val allAccessions = accessionVersions.map { it.accession }
        val accession1 = allAccessions[0]
        val accession2 = allAccessions[1]

        // Revise all accessions so accession1 and accession2 both get version 2
        convenienceClient.reviseAndProcessDefaultSequenceEntries(allAccessions)

        // Request accession1 by bare accession (all versions) and accession2 by specific version 1 only
        val result = submissionControllerClient.getDetails(
            accessionOrAccessionVersions = listOf(accession1, "$accession2.1"),
        ).expectNdjsonAndGetContent<AccessionVersionWithOrganism>()

        val accession1Results = result.filter { it.accession == accession1 }
        val accession2Results = result.filter { it.accession == accession2 }

        assertThat(accession1Results, hasSize(2))
        assertThat(accession2Results, hasSize(1))
        assertThat(accession2Results[0].version, `is`(1L))
    }

    @Test
    fun `GIVEN released revocation entry THEN it is included in results`() {
        convenienceClient.prepareRevokedSequenceEntries()
        val allReleased = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val accession = allReleased.first().accession

        val revokedAccessionVersions = submissionControllerClient.getDetails(
            accessionOrAccessionVersions = listOf(accession),
        ).expectNdjsonAndGetContent<AccessionVersionWithOrganism>()

        assertThat(revokedAccessionVersions.size, greaterThan(0))
    }

    @Test
    fun `GIVEN released data THEN endpoint is publicly accessible without authentication`() {
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val accession = accessionVersions.first().accession

        // No JWT is provided — endpoint must be public
        submissionControllerClient.getDetails(accessionOrAccessionVersions = listOf(accession))
            .andExpect(status().isOk)
    }

    @Test
    fun `GIVEN multiple accessions THEN returns results ordered by accession and version`() {
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val accessions = accessionVersions.map { it.accession }

        val result = submissionControllerClient.getDetails(accessionOrAccessionVersions = accessions)
            .expectNdjsonAndGetContent<AccessionVersionWithOrganism>()

        assertThat(result, hasSize(accessions.size))
        val resultAccessions = result.map { it.accession }
        assertThat(resultAccessions, `is`(resultAccessions.sorted()))
    }
}
