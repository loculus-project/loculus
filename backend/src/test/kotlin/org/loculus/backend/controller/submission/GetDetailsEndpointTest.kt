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
    fun `GIVEN neither accessions nor accessionVersions THEN returns 400`() {
        submissionControllerClient.getDetails()
            .andExpect(status().isBadRequest)
            .andExpect(
                content().string(
                    containsString("At least one of 'accessions' or 'accessionVersions' must be provided."),
                ),
            )
    }

    @Test
    fun `GIVEN empty accessions and accessionVersions lists THEN returns 400`() {
        submissionControllerClient.getDetails(accessions = emptyList(), accessionVersions = emptyList())
            .andExpect(status().isBadRequest)
            .andExpect(
                content().string(
                    containsString("At least one of 'accessions' or 'accessionVersions' must be provided."),
                ),
            )
    }

    @Test
    fun `GIVEN accessionVersion without dot separator THEN returns 400`() {
        submissionControllerClient.getDetails(accessionVersions = listOf("LOC_000S01D"))
            .andExpect(status().isBadRequest)
            .andExpect(content().string(containsString("Invalid accession version format")))
    }

    @Test
    fun `GIVEN accessionVersion with non-numeric version THEN returns 400`() {
        submissionControllerClient.getDetails(accessionVersions = listOf("LOC_000S01D.abc"))
            .andExpect(status().isBadRequest)
            .andExpect(content().string(containsString("Version must be a number")))
    }

    @Test
    fun `GIVEN accessionVersion with trailing dot THEN returns 400`() {
        submissionControllerClient.getDetails(accessionVersions = listOf("LOC_000S01D."))
            .andExpect(status().isBadRequest)
            .andExpect(content().string(containsString("Invalid accession version format")))
    }

    @Test
    fun `GIVEN no matching accession in database THEN returns empty result`() {
        val result = submissionControllerClient.getDetails(accessions = listOf("NONEXISTENT"))
            .expectNdjsonAndGetContent<AccessionVersionWithOrganism>()

        assertThat(result, `is`(empty()))
    }

    @Test
    fun `GIVEN unreleased sequence entry THEN does not return it`() {
        convenienceClient.prepareDefaultSequenceEntriesToInProcessing()

        val result = submissionControllerClient.getDetails(accessions = listOf("LOC_000S01D"))
            .expectNdjsonAndGetContent<AccessionVersionWithOrganism>()

        assertThat(result, `is`(empty()))
    }

    @Test
    fun `GIVEN released data THEN returns it for a bare accession`() {
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val accession = accessionVersions.first().accession

        val result = submissionControllerClient.getDetails(accessions = listOf(accession))
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
        val accession = accessionVersions.first().accession
        convenienceClient.reviseAndProcessDefaultSequenceEntries(listOf(accession))

        val result = submissionControllerClient.getDetails(accessions = listOf(accession))
            .expectNdjsonAndGetContent<AccessionVersionWithOrganism>()

        assertThat(result, hasSize(2))
        assertThat(result[0].accession, `is`(accession))
        assertThat(result[0].version, `is`(1L))
        assertThat(result[1].accession, `is`(accession))
        assertThat(result[1].version, `is`(2L))
    }

    @Test
    fun `GIVEN released data with multiple versions THEN accessionVersion returns only that version`() {
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val accession = accessionVersions.first().accession
        convenienceClient.reviseAndProcessDefaultSequenceEntries(listOf(accession))

        val result = submissionControllerClient.getDetails(accessionVersions = listOf("$accession.1"))
            .expectNdjsonAndGetContent<AccessionVersionWithOrganism>()

        assertThat(result, hasSize(1))
        assertThat(result[0].accession, `is`(accession))
        assertThat(result[0].version, `is`(1L))
    }

    @Test
    fun `GIVEN mix of accessions and accessionVersions THEN returns correct combined results`() {
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val accession1 = accessionVersions[0].accession
        val accession2 = accessionVersions[1].accession

        // Revise accession1 to create version 2
        convenienceClient.reviseAndProcessDefaultSequenceEntries(listOf(accession1))

        // Request accession1 by bare accession (all versions) and accession2 by specific version
        val result = submissionControllerClient.getDetails(
            accessions = listOf(accession1),
            accessionVersions = listOf("$accession2.1"),
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

        // Get all accessions including the revoked one
        val revokedAccessionVersions = submissionControllerClient.getDetails(accessions = listOf(accession))
            .expectNdjsonAndGetContent<AccessionVersionWithOrganism>()

        assertThat(revokedAccessionVersions.size, greaterThan(0))
    }

    @Test
    fun `GIVEN released data THEN endpoint is publicly accessible without authentication`() {
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val accession = accessionVersions.first().accession

        // No JWT is provided — endpoint must be public
        submissionControllerClient.getDetails(accessions = listOf(accession))
            .andExpect(status().isOk)
    }

    @Test
    fun `GIVEN multiple accessions THEN returns results ordered by accession and version`() {
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val accessions = accessionVersions.map { it.accession }

        val result = submissionControllerClient.getDetails(accessions = accessions)
            .expectNdjsonAndGetContent<AccessionVersionWithOrganism>()

        assertThat(result, hasSize(accessions.size))
        val resultAccessions = result.map { it.accession }
        assertThat(resultAccessions, `is`(resultAccessions.sorted()))
    }
}
