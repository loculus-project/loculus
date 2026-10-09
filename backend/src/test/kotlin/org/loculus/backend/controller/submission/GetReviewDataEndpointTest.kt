package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.loculus.backend.api.EditedSequenceEntryData
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.api.Status
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.generateJwtFor
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest(properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG"])
class GetReviewDataEndpointTest(
    @Autowired private val client: SubmissionControllerClient,
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val objectMapper: ObjectMapper,
    @Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `review data is opt in and matches the editor metadata and annotations without sequences`() {
        val accession = convenienceClient.prepareDataTo(Status.PROCESSED, errors = true).first().accession
        val edited = convenienceClient.getSequenceEntryToEdit(accession, 1)
        for (include in listOf(null, false)) {
            client.getSequenceEntries(includeReviewData = include)
                .andExpect(status().isOk)
                .andExpect(jsonPath("$.sequenceEntries[0].reviewData").doesNotExist())
        }
        val response = getReviewPage()
        val data = response["sequenceEntries"].first { it["accession"].asText() == accession }["reviewData"]
        assertThat(data["metadata"], `is`(objectMapper.valueToTree<JsonNode>(edited.processedData.metadata)))
        assertThat(data["errors"], `is`(objectMapper.valueToTree<JsonNode>(edited.errors)))
        assertThat(data["warnings"], `is`(objectMapper.valueToTree<JsonNode>(edited.warnings)))
        assertThat(data["files"], `is`(objectMapper.valueToTree<JsonNode>(edited.processedData.files)))
        assertThat(data["revision"].isNull, `is`(true))
        for (field in listOf(
            "unalignedNucleotideSequences",
            "alignedNucleotideSequences",
            "alignedAminoAcidSequences",
            "submittedData",
        )) {
            assertThat(response.findValues(field).isEmpty(), `is`(true))
        }
    }

    @Test
    fun `review includes file descriptors without downloading their contents`() {
        convenienceClient.submitDefaultFiles(includeFileMapping = true)
        val entry = convenienceClient.extractUnprocessedData().first()
        val files = entry.data.files!!.mapValues { (_, values) ->
            values.map { FileIdAndName(it.fileId, it.name) }
        }
        val processed = PreparedProcessedData.successfullyProcessed(entry.accession)
        convenienceClient.submitProcessedData(processed.copy(data = processed.data.copy(files = files)))
        val data = getReviewPage()["sequenceEntries"].first {
            it["accession"].asText() == entry.accession
        }["reviewData"]
        assertThat(data["files"], `is`(objectMapper.valueToTree<JsonNode>(files)))
    }

    @Test
    fun `review enrichment preserves filtering pagination and group counts`() {
        convenienceClient.prepareDataTo(Status.PROCESSED)
        convenienceClient.prepareDataTo(Status.RECEIVED)
        val plain = objectMapper.readTree(
            client.getSequenceEntries(statusesFilter = listOf(Status.PROCESSED), page = 1, size = 3)
                .andExpect(status().isOk).andReturn().response.contentAsString,
        )
        val enriched = objectMapper.readTree(
            client.getSequenceEntries(
                statusesFilter = listOf(Status.PROCESSED),
                page = 1,
                size = 3,
                includeReviewData = true,
            ).andExpect(status().isOk).andReturn().response.contentAsString,
        )
        assertThat(enriched["sequenceEntries"].size(), `is`(3))
        assertThat(enriched["sequenceEntries"].all { it.has("reviewData") }, `is`(true))
        assertThat(
            enriched["sequenceEntries"].map {
                it["accession"]
            },
            `is`(plain["sequenceEntries"].map { it["accession"] }),
        )
        assertThat(enriched["statusCounts"], `is`(plain["statusCounts"]))
        assertThat(enriched["processingResultCounts"], `is`(plain["processingResultCounts"]))
    }

    @Test
    fun `pending and revocation entries do not have review payloads`() {
        convenienceClient.prepareDefaultSequenceEntriesToAwaitingApprovalForRevocation()
        convenienceClient.prepareDataTo(Status.RECEIVED)
        convenienceClient.prepareDataTo(Status.IN_PROCESSING)
        assertThat(getReviewPage()["sequenceEntries"].all { !it.has("reviewData") }, `is`(true))
    }

    @Test
    fun `review data requires bounded pagination`() {
        for ((page, size) in listOf(null to null, 0 to null, null to 10, -1 to 10, 0 to 0, 0 to 101)) {
            client.getSequenceEntries(page = page, size = size, includeReviewData = true)
                .andExpect(status().isBadRequest)
        }
    }

    @Test
    fun `review payloads are restricted to authorized groups`() {
        val accession = convenienceClient.prepareDataTo(Status.PROCESSED).first().accession
        val entry = convenienceClient.getSequenceEntryToEdit(accession, 1)
        client.getSequenceEntries(
            groupIdsFilter = listOf(entry.groupId),
            page = 0,
            size = 10,
            includeReviewData = true,
            jwt = generateJwtFor("not-a-group-member"),
        ).andExpect(status().isForbidden)
        client.getSequenceEntries(
            page = 0,
            size = 10,
            includeReviewData = true,
            jwt = generateJwtFor("not-a-group-member"),
        ).andExpect(status().isOk).andExpect(jsonPath("$.sequenceEntries").isEmpty)
    }

    @Test
    fun `revision response contains baseline metadata and sequence change flags`() {
        val versions = convenienceClient.prepareDataTo(Status.APPROVED_FOR_RELEASE)
        val accession = versions.first().accession
        val baseline = convenienceClient.getSequenceEntryToEdit(accession, 1)
        convenienceClient.reviseDefaultProcessedSequenceEntries(versions.map { it.accession })
        convenienceClient.extractUnprocessedData()
        val processed = PreparedProcessedData.successfullyProcessed(accession, version = 2)
        convenienceClient.submitProcessedData(processed)
        val revision = getReviewPage()["sequenceEntries"].first {
            it["accession"].asText() == accession
        }["reviewData"]["revision"]
        assertThat(revision["previousVersion"].asLong(), `is`(1L))
        assertThat(
            revision["previousMetadata"],
            `is`(objectMapper.valueToTree<JsonNode>(baseline.processedData.metadata)),
        )
        assertThat(revision["nucleotideChanges"][MAIN_SEGMENT]["changed"].asBoolean(), `is`(false))

        val sequence = revision["nucleotideChanges"][MAIN_SEGMENT]
        val originalLength = baseline.processedData.unalignedNucleotideSequences.getValue(MAIN_SEGMENT)!!.length
        assertThat(sequence["previousLength"].asInt(), `is`(originalLength))
        assertThat(sequence["currentLength"].asInt(), `is`(originalLength))

        // Reprocessing the same version must update its comparison.
        client.submitEditedSequenceEntryVersion(
            EditedSequenceEntryData(accession, 2, baseline.submittedData),
        ).andExpect(status().isNoContent)
        convenienceClient.extractUnprocessedData()
        convenienceClient.submitProcessedData(
            processed.copy(data = processed.data.copy(unalignedNucleotideSequences = mapOf(MAIN_SEGMENT to "ACGT"))),
        )
        val changed = getReviewPage()["sequenceEntries"].first {
            it["accession"].asText() == accession
        }["reviewData"]["revision"]
        assertThat(changed["nucleotideChanges"][MAIN_SEGMENT]["changed"].asBoolean(), `is`(true))
        assertThat(changed["nucleotideChanges"][MAIN_SEGMENT]["previousLength"].asInt(), `is`(originalLength))
        assertThat(changed["nucleotideChanges"][MAIN_SEGMENT]["currentLength"].asInt(), `is`(4))
    }

    @Test
    fun `revision comparison skips revoked versions`() {
        val versions = convenienceClient.prepareRevokedSequenceEntries()
        val accession = versions.first().accession
        convenienceClient.reviseDefaultProcessedSequenceEntries(versions.map { it.accession })
        convenienceClient.extractUnprocessedData()
        convenienceClient.submitProcessedData(PreparedProcessedData.successfullyProcessed(accession, version = 3))
        val revision = getReviewPage()["sequenceEntries"].first {
            it["accession"].asText() == accession
        }["reviewData"]["revision"]
        assertThat(revision["previousVersion"].asLong(), `is`(1L))
        val baseline = convenienceClient.getSequenceEntryToEdit(accession, 1)
        assertThat(
            revision["previousMetadata"],
            `is`(objectMapper.valueToTree<JsonNode>(baseline.processedData.metadata)),
        )
        assertThat(revision["nucleotideChanges"][MAIN_SEGMENT]["changed"].asBoolean(), `is`(false))
    }

    @ParameterizedTest
    @ValueSource(ints = [1, 2])
    fun `metadata comparison does not require sequence JSON`(versionWithoutSequences: Int) {
        val versions = convenienceClient.prepareDataTo(Status.APPROVED_FOR_RELEASE)
        val accession = versions.first().accession
        val baseline = convenienceClient.getSequenceEntryToEdit(accession, 1)
        convenienceClient.reviseDefaultProcessedSequenceEntries(versions.map { it.accession })
        convenienceClient.extractUnprocessedData()
        convenienceClient.submitProcessedData(PreparedProcessedData.successfullyProcessed(accession, version = 2))
        jdbcTemplate.update(
            "UPDATE sequence_entries_preprocessed_data " +
                "SET processed_data = processed_data - 'unalignedNucleotideSequences' " +
                "WHERE accession = ? AND version = ?",
            accession,
            versionWithoutSequences,
        )
        val revision = getReviewPage()["sequenceEntries"].first {
            it["accession"].asText() == accession
        }["reviewData"]["revision"]
        assertThat(
            revision["previousMetadata"],
            `is`(objectMapper.valueToTree<JsonNode>(baseline.processedData.metadata)),
        )
        assertThat(revision["nucleotideChanges"].isEmpty, `is`(true))
    }

    @Test
    fun `missing processed baseline does not prevent loading current review data`() {
        val versions = convenienceClient.prepareDataTo(Status.APPROVED_FOR_RELEASE)
        val accession = versions.first().accession
        convenienceClient.reviseDefaultProcessedSequenceEntries(versions.map { it.accession })
        convenienceClient.extractUnprocessedData()
        convenienceClient.submitProcessedData(PreparedProcessedData.successfullyProcessed(accession, version = 2))
        val current = convenienceClient.getSequenceEntryToEdit(accession, 2)
        jdbcTemplate.update(
            "DELETE FROM sequence_entries_preprocessed_data WHERE accession = ? AND version = 1",
            accession,
        )
        val data = getReviewPage()["sequenceEntries"].first {
            it["accession"].asText() == accession
        }["reviewData"]
        assertThat(data["metadata"], `is`(objectMapper.valueToTree<JsonNode>(current.processedData.metadata)))
        assertThat(data["revision"]["previousVersion"].asLong(), `is`(1L))
        assertThat(data["revision"]["previousMetadata"].isNull, `is`(true))
        assertThat(data["revision"]["nucleotideChanges"].isEmpty, `is`(true))
    }

    private fun getReviewPage(): JsonNode = objectMapper.readTree(
        client.getSequenceEntries(
            statusesFilter = listOf(Status.RECEIVED, Status.IN_PROCESSING, Status.PROCESSED),
            page = 0,
            size = 100,
            includeReviewData = true,
        ).andExpect(status().isOk).andReturn().response.contentAsString,
    )
}
