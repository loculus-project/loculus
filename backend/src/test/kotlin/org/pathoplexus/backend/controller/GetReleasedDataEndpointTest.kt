package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.node.IntNode
import com.fasterxml.jackson.databind.node.TextNode
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.matchesPattern
import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test
import org.pathoplexus.backend.api.AccessionVersion
import org.pathoplexus.backend.api.ProcessedData
import org.pathoplexus.backend.api.SiloVersionStatus
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles.firstAccession
import org.pathoplexus.backend.service.Accession
import org.pathoplexus.backend.service.Version
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

private const val numberOfFieldsWithUnknownValue = 2

@EndpointTest
class GetReleasedDataEndpointTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val submissionControllerClient: SubmissionControllerClient,
) {
    val currentYear = Clock.System.now().toLocalDateTime(TimeZone.UTC).year

    @Test
    @Disabled("TODO(#607) reactivate")
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse {
            submissionControllerClient.getReleasedData(jwt = it)
        }
    }

    // TODO(#607): delete
    @Test
    fun `GIVEN no access token THEN access is allowed`() {
        submissionControllerClient.getReleasedData(jwt = null).andExpect(status().isOk)
    }

    @Test
    fun `GIVEN no sequence entries in database THEN returns empty response`() {
        val response = submissionControllerClient.getReleasedData()

        val responseBody = response.expectNdjsonAndGetContent<ProcessedData>()
        assertThat(responseBody, `is`(emptyList()))
    }

    @Test
    fun `GIVEN released data exists THEN returns it with additional metadata fields`() {
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()

        val response = submissionControllerClient.getReleasedData()

        val responseBody = response.expectNdjsonAndGetContent<ProcessedData>()

        assertThat(responseBody.size, `is`(DefaultFiles.NUMBER_OF_SEQUENCES))

        responseBody.forEach {
            val id = it.metadata["accession"]!!.asText()
            val version = it.metadata["version"]!!.asLong()
            assertThat(version, `is`(1L))

            val expectedMetadata = defaultProcessedData.metadata + mapOf(
                "accession" to TextNode(id),
                "version" to IntNode(version.toInt()),
                "accessionVersion" to TextNode("$id.$version"),
                "isRevocation" to TextNode("false"),
                "submitter" to TextNode(USER_NAME),
                "versionStatus" to TextNode("LATEST_VERSION"),
            )

            assertThat(it.metadata.size, `is`(expectedMetadata.size + numberOfFieldsWithUnknownValue))
            for ((key, value) in it.metadata) {
                when (key) {
                    "submittedAt" -> {
                        val dateTime = LocalDateTime.parse(value.textValue(), DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                        assertThat(dateTime.year, `is`(currentYear))
                    }

                    "submissionId" -> assertThat(value.textValue(), matchesPattern("^custom\\d$"))
                    else -> assertThat(value, `is`(expectedMetadata[key]))
                }
            }
            assertThat(it.alignedNucleotideSequences, `is`(defaultProcessedData.alignedNucleotideSequences))
            assertThat(it.unalignedNucleotideSequences, `is`(defaultProcessedData.unalignedNucleotideSequences))
            assertThat(it.alignedAminoAcidSequences, `is`(defaultProcessedData.alignedAminoAcidSequences))
            assertThat(it.nucleotideInsertions, `is`(defaultProcessedData.nucleotideInsertions))
            assertThat(it.aminoAcidInsertions, `is`(defaultProcessedData.aminoAcidInsertions))
        }
    }

    @Test
    fun `GIVEN released data exists in multiple versions THEN the 'versionStatus' flag is set correctly`() {
        val (
            revokedVersion1,
            revokedVersion2,
            _,
//            revocationVersion3,
            revisedVersion4,
            latestVersion5,
        ) = prepareRevokedAndRevocationAndRevisedVersions()

        val response = submissionControllerClient.getReleasedData().expectNdjsonAndGetContent<ProcessedData>()

        // TODO(#429): this should show 50 sequences when including revocation versions
//        assertThat(response.size, `is`(5 * DefaultFiles.NUMBER_OF_SEQUENCES))
        assertThat(response.size, `is`(4 * DefaultFiles.NUMBER_OF_SEQUENCES))
        assertThat(
            response.findAccessionVersionStatus(firstAccession, revokedVersion1),
            `is`(SiloVersionStatus.REVOKED.name),
        )
        assertThat(
            response.findAccessionVersionStatus(firstAccession, revokedVersion2),
            `is`(SiloVersionStatus.REVOKED.name),
        )
        // TODO(#429): reactivate this check
//        assertThat(
//            response.findAccessionVersionStatus(firstSequence, revocationVersion3),
//            `is`(SiloVersionStatus.REVISED.name),
//        )
        assertThat(
            response.findAccessionVersionStatus(firstAccession, revisedVersion4),
            `is`(SiloVersionStatus.REVISED.name),
        )
        assertThat(
            response.findAccessionVersionStatus(firstAccession, latestVersion5),
            `is`(SiloVersionStatus.LATEST_VERSION.name),
        )
    }

    private fun prepareRevokedAndRevocationAndRevisedVersions(): PreparedVersions {
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        convenienceClient.reviseAndProcessDefaultSequenceEntries()

        convenienceClient.revokeSequenceEntries(DefaultFiles.allAccessions)
        convenienceClient.confirmRevocation(
            DefaultFiles.allAccessions.map { AccessionVersion(accession = it, version = 3L) },
        )

        convenienceClient.reviseAndProcessDefaultSequenceEntries()
        convenienceClient.reviseAndProcessDefaultSequenceEntries()

        return PreparedVersions(
            revokedVersion1 = 1L,
            revokedVersion2 = 2L,
            revocationVersion3 = 3L,
            revisedVersion4 = 4L,
            latestVersion5 = 5L,
        )
    }
}

private fun List<ProcessedData>.findAccessionVersionStatus(accession: Accession, version: Version): String {
    val processedData =
        find { it.metadata["accession"]?.asText() == accession && it.metadata["version"]?.asLong() == version }
            ?: error("Could not find accession version $accession.$version")

    return processedData.metadata["versionStatus"]!!.asText()
}

data class PreparedVersions(
    val revokedVersion1: Version,
    val revokedVersion2: Version,
    val revocationVersion3: Version,
    val revisedVersion4: Version,
    val latestVersion5: Version,
)
