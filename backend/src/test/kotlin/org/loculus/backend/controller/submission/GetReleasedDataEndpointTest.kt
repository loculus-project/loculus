package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.IntNode
import com.fasterxml.jackson.databind.node.NullNode
import com.fasterxml.jackson.databind.node.TextNode
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.matchesPattern
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.SiloVersionStatus
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectForbiddenResponse
import org.loculus.backend.controller.expectNdjsonAndGetContent
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles.firstAccession
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.Version
import org.springframework.beans.factory.annotation.Autowired
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

private val ADDED_FIELDS_WITH_UNKNOWN_VALUES_FOR_RELEASE = listOf("releasedAt", "submissionId", "submittedAt")

@EndpointTest
class GetReleasedDataEndpointTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val submissionControllerClient: SubmissionControllerClient,
) {
    val currentYear = Clock.System.now().toLocalDateTime(TimeZone.UTC).year

    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse {
            submissionControllerClient.getReleasedData(jwt = it)
        }
    }

    @Test
    fun `GIVEN authorization token with THEN returns 403 Forbidden`() {
        expectForbiddenResponse {
            submissionControllerClient.getReleasedData(
                jwt = jwtForDefaultUser,
            )
        }
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
                "submitter" to TextNode(DEFAULT_USER_NAME),
                "versionStatus" to TextNode("LATEST_VERSION"),
            )

            assertThat(
                "${it.metadata}",
                it.metadata.size,
                `is`(expectedMetadata.size + ADDED_FIELDS_WITH_UNKNOWN_VALUES_FOR_RELEASE.size),
            )
            for ((key, value) in it.metadata) {
                when (key) {
                    "submittedAt" -> expectIsDateWithCurrentYear(value)
                    "releasedAt" -> expectIsDateWithCurrentYear(value)
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
            revocationVersion3,
            revisedVersion4,
            latestVersion5,
        ) = prepareRevokedAndRevocationAndRevisedVersions()

        val response = submissionControllerClient.getReleasedData().expectNdjsonAndGetContent<ProcessedData>()

        assertThat(response.size, `is`(5 * DefaultFiles.NUMBER_OF_SEQUENCES))
        assertThat(
            response.findAccessionVersionStatus(firstAccession, revokedVersion1),
            `is`(SiloVersionStatus.REVOKED.name),
        )
        assertThat(
            response.findAccessionVersionStatus(firstAccession, revokedVersion2),
            `is`(SiloVersionStatus.REVOKED.name),
        )
        assertThat(
            response.findAccessionVersionStatus(firstAccession, revocationVersion3),
            `is`(SiloVersionStatus.REVISED.name),
        )
        assertThat(
            response.findAccessionVersionStatus(firstAccession, revisedVersion4),
            `is`(SiloVersionStatus.REVISED.name),
        )
        assertThat(
            response.findAccessionVersionStatus(firstAccession, latestVersion5),
            `is`(SiloVersionStatus.LATEST_VERSION.name),
        )
    }

    @Test
    fun `GIVEN preprocessing pipeline submitted with missing metadata fields THEN fields are filled with null`() {
        val absentFields = listOf("dateSubmitted", "division", "host", "age", "sex", "qc")

        val accessVersions = convenienceClient.prepareDefaultSequenceEntriesToInProcessing()
        convenienceClient.submitProcessedData(
            accessVersions.map {
                PreparedProcessedData.withMissingMetadataFields(
                    accession = it.accession,
                    version = it.version,
                    absentFields = absentFields,
                )
            },
        )
        convenienceClient.approveProcessedSequenceEntries(accessVersions)

        val firstSequenceEntry =
            submissionControllerClient.getReleasedData().expectNdjsonAndGetContent<ProcessedData>()[0]

        for (absentField in absentFields) {
            assertThat(firstSequenceEntry.metadata[absentField], `is`(NullNode.instance))
        }
    }

    @Test
    fun `GIVEN revocation version THEN all data is present but mostly null`() {
        convenienceClient.prepareRevokedSequenceEntries()

        val revocationEntry = submissionControllerClient.getReleasedData()
            .expectNdjsonAndGetContent<ProcessedData>()
            .find { it.metadata["isRevocation"]!!.asBoolean() }!!

        for ((key, value) in revocationEntry.metadata) {
            when (key) {
                "isRevocation" -> assertThat(value, `is`(TextNode("true")))
                "versionStatus" -> assertThat(value, `is`(TextNode("LATEST_VERSION")))
                "submittedAt" -> expectIsDateWithCurrentYear(value)
                "releasedAt" -> expectIsDateWithCurrentYear(value)
                "submitter" -> assertThat(value, `is`(TextNode(DEFAULT_USER_NAME)))
                "accession", "version", "accessionVersion", "submissionId" -> {}
                else -> assertThat("value for $key", value, `is`(NullNode.instance))
            }
        }

        val expectedNucleotideSequences = mapOf(
            MAIN_SEGMENT to null,
        )
        assertThat(revocationEntry.alignedNucleotideSequences, `is`(expectedNucleotideSequences))
        assertThat(revocationEntry.unalignedNucleotideSequences, `is`(expectedNucleotideSequences))

        val expectedAminoAcidSequences = mapOf(
            SOME_LONG_GENE to null,
            SOME_SHORT_GENE to null,
        )
        assertThat(revocationEntry.alignedAminoAcidSequences, `is`(expectedAminoAcidSequences))

        val expectedNucleotideInsertions = mapOf(
            MAIN_SEGMENT to emptyList<String>(),
        )
        assertThat(revocationEntry.nucleotideInsertions, `is`(expectedNucleotideInsertions))

        val expectedAminoAcidInsertions = mapOf(
            SOME_LONG_GENE to emptyList<String>(),
            SOME_SHORT_GENE to emptyList(),
        )
        assertThat(revocationEntry.aminoAcidInsertions, `is`(expectedAminoAcidInsertions))
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

    private fun expectIsDateWithCurrentYear(value: JsonNode) {
        val dateTime = LocalDateTime.parse(value.textValue(), DateTimeFormatter.ISO_LOCAL_DATE_TIME)
        assertThat(dateTime.year, `is`(currentYear))
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
