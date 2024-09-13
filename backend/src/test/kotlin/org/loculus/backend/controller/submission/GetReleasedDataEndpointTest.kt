package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.BooleanNode
import com.fasterxml.jackson.databind.node.IntNode
import com.fasterxml.jackson.databind.node.NullNode
import com.fasterxml.jackson.databind.node.TextNode
import com.fasterxml.jackson.module.kotlin.readValue
import com.github.luben.zstd.ZstdInputStream
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.matchesPattern
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.SiloVersionStatus
import org.loculus.backend.api.Status
import org.loculus.backend.controller.DEFAULT_GROUP_NAME
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectNdjsonAndGetContent
import org.loculus.backend.controller.jacksonObjectMapper
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.Version
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.shaded.org.awaitility.Awaitility.await

private val ADDED_FIELDS_WITH_UNKNOWN_VALUES_FOR_RELEASE = listOf(
    "releasedAtTimestamp",
    "submissionId",
    "submittedAtTimestamp",
    "groupId",
)

@EndpointTest
class GetReleasedDataEndpointTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val submissionControllerClient: SubmissionControllerClient,
) {
    val currentYear = Clock.System.now().toLocalDateTime(TimeZone.UTC).year

    @Test
    fun `GIVEN no sequence entries in database THEN returns empty response`() {
        val response = submissionControllerClient.getReleasedData()

        val responseBody = response.expectNdjsonAndGetContent<ProcessedData<GeneticSequence>>()
        assertThat(responseBody, `is`(emptyList()))

        response.andExpect(status().isOk)
            .andExpect(header().string("x-total-records", `is`("0")))
    }

    @Test
    fun `GIVEN released data exists THEN returns it with additional metadata fields`() {
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()

        val response = submissionControllerClient.getReleasedData()

        val responseBody = response.expectNdjsonAndGetContent<ProcessedData<GeneticSequence>>()

        assertThat(responseBody.size, `is`(NUMBER_OF_SEQUENCES))

        response.andExpect(header().string("x-total-records", NUMBER_OF_SEQUENCES.toString()))

        responseBody.forEach {
            val id = it.metadata["accession"]!!.asText()
            val version = it.metadata["version"]!!.asLong()
            assertThat(version, `is`(1L))

            val expectedMetadata = defaultProcessedData.metadata + mapOf(
                "accession" to TextNode(id),
                "version" to IntNode(version.toInt()),
                "accessionVersion" to TextNode("$id.$version"),
                "isRevocation" to BooleanNode.FALSE,
                "submitter" to TextNode(DEFAULT_USER_NAME),
                "groupName" to TextNode(DEFAULT_GROUP_NAME),
                "versionStatus" to TextNode("LATEST_VERSION"),
                "dataUseTerms" to TextNode("OPEN"),
                "releasedDate" to TextNode(Clock.System.now().toLocalDateTime(TimeZone.UTC).date.toString()),
                "submittedDate" to TextNode(Clock.System.now().toLocalDateTime(TimeZone.UTC).date.toString()),
                "dataUseTermsRestrictedUntil" to NullNode.getInstance(),
                "versionComment" to NullNode.getInstance(),
                "booleanColumn" to BooleanNode.TRUE,
            )

            assertThat(
                "${it.metadata}",
                it.metadata.size,
                `is`(expectedMetadata.size + ADDED_FIELDS_WITH_UNKNOWN_VALUES_FOR_RELEASE.size),
            )
            for ((key, value) in it.metadata) {
                when (key) {
                    "submittedAtTimestamp" -> expectIsTimestampWithCurrentYear(value)
                    "releasedAtTimestamp" -> expectIsTimestampWithCurrentYear(value)
                    "submissionId" -> assertThat(value.textValue(), matchesPattern("^custom\\d$"))
                    "groupId" -> assertThat(value.intValue(), greaterThan(0))
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
            accession,
            revokedVersion1,
            revokedVersion2,
            revocationVersion3,
            revisedVersion4,
            latestVersion5,
        ) = prepareRevokedAndRevocationAndRevisedVersions()

        val response =
            submissionControllerClient.getReleasedData().expectNdjsonAndGetContent<ProcessedData<GeneticSequence>>()

        assertThat(
            response.findAccessionVersionStatus(accession, revokedVersion1),
            `is`(SiloVersionStatus.REVOKED.name),
        )
        assertThat(
            response.findAccessionVersionStatus(accession, revokedVersion2),
            `is`(SiloVersionStatus.REVOKED.name),
        )
        assertThat(
            response.findAccessionVersionStatus(accession, revocationVersion3),
            `is`(SiloVersionStatus.REVISED.name),
        )
        assertThat(
            response.findAccessionVersionStatus(accession, revisedVersion4),
            `is`(SiloVersionStatus.REVISED.name),
        )
        assertThat(
            response.findAccessionVersionStatus(accession, latestVersion5),
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
            submissionControllerClient.getReleasedData().expectNdjsonAndGetContent<ProcessedData<GeneticSequence>>()[0]

        for (absentField in absentFields) {
            assertThat(firstSequenceEntry.metadata[absentField], `is`(NullNode.instance))
        }
    }

    @Test
    fun `GIVEN revocation version THEN all data is present but mostly null`() {
        convenienceClient.prepareRevokedSequenceEntries()

        val revocationEntry = submissionControllerClient.getReleasedData()
            .expectNdjsonAndGetContent<ProcessedData<GeneticSequence>>()
            .find { it.metadata["isRevocation"]!!.asBoolean() }!!

        for ((key, value) in revocationEntry.metadata) {
            when (key) {
                "isRevocation" -> assertThat(value, `is`(BooleanNode.TRUE))
                "versionStatus" -> assertThat(value, `is`(TextNode("LATEST_VERSION")))
                "submittedAtTimestamp" -> expectIsTimestampWithCurrentYear(value)
                "releasedAtTimestamp" -> expectIsTimestampWithCurrentYear(value)
                "submitter" -> assertThat(value, `is`(TextNode(DEFAULT_USER_NAME)))
                "groupName" -> assertThat(value, `is`(TextNode(DEFAULT_GROUP_NAME)))
                "groupId" -> assertThat(value.intValue(), `is`(greaterThan(0)))
                "accession", "version", "accessionVersion", "submissionId" -> {}
                "dataUseTerms" -> assertThat(value, `is`(TextNode("OPEN")))
                "submittedDate" -> assertThat(
                    value,
                    `is`(TextNode(Clock.System.now().toLocalDateTime(TimeZone.UTC).date.toString())),
                )

                "releasedDate" -> assertThat(
                    value,
                    `is`(TextNode(Clock.System.now().toLocalDateTime(TimeZone.UTC).date.toString())),
                )

                "versionComment" -> assertThat(
                    value,
                    `is`(TextNode("This is a test revocation")),
                )

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

    @Test
    fun `WHEN I request zstd compressed data THEN should return zstd compressed data`() {
        convenienceClient.prepareDataTo(Status.APPROVED_FOR_RELEASE)

        val response = submissionControllerClient.getReleasedData(compression = "zstd")
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_NDJSON_VALUE))
            .andExpect(header().string(HttpHeaders.CONTENT_ENCODING, "zstd"))
            .andReturn()
            .response
        await().until {
            response.isCommitted
        }
        val content = response.contentAsByteArray

        val decompressedContent = ZstdInputStream(content.inputStream())
            .apply { setContinuous(true) }
            .readAllBytes()
            .decodeToString()

        val data = decompressedContent.lines()
            .filter { it.isNotBlank() }
            .map { jacksonObjectMapper.readValue<ProcessedData<GeneticSequence>>(it) }

        assertThat(data, hasSize(NUMBER_OF_SEQUENCES))
        assertThat(data[0].metadata, `is`(not(emptyMap())))
    }

    private fun prepareRevokedAndRevocationAndRevisedVersions(): PreparedVersions {
        val preparedSubmissions = convenienceClient.prepareDataTo(Status.APPROVED_FOR_RELEASE)
        convenienceClient.reviseAndProcessDefaultSequenceEntries(preparedSubmissions.map { it.accession })

        val revokedSequences = convenienceClient.revokeSequenceEntries(preparedSubmissions.map { it.accession })
        convenienceClient.approveProcessedSequenceEntries(revokedSequences)

        convenienceClient.reviseAndProcessDefaultSequenceEntries(revokedSequences.map { it.accession })

        convenienceClient.reviseAndProcessDefaultSequenceEntries(revokedSequences.map { it.accession })

        return PreparedVersions(
            accession = preparedSubmissions.first().accession,
            revokedVersion1 = 1L,
            revokedVersion2 = 2L,
            revocationVersion3 = 3L,
            revisedVersion4 = 4L,
            latestVersion5 = 5L,
        )
    }

    private fun expectIsTimestampWithCurrentYear(value: JsonNode) {
        val dateTime = Instant.fromEpochSeconds(value.asLong()).toLocalDateTime(TimeZone.UTC)
        assertThat(dateTime.year, `is`(currentYear))
    }
}

private fun List<ProcessedData<GeneticSequence>>.findAccessionVersionStatus(
    accession: Accession,
    version: Version,
): String {
    val processedData =
        find { it.metadata["accession"]?.asText() == accession && it.metadata["version"]?.asLong() == version }
            ?: error("Could not find accession version $accession.$version")

    return processedData.metadata["versionStatus"]!!.asText()
}

data class PreparedVersions(
    val accession: Accession,
    val revokedVersion1: Version,
    val revokedVersion2: Version,
    val revocationVersion3: Version,
    val revisedVersion4: Version,
    val latestVersion5: Version,
)
