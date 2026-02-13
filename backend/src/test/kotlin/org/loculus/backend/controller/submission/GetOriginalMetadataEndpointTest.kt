package org.loculus.backend.controller.submission

import com.fasterxml.jackson.module.kotlin.readValue
import com.github.luben.zstd.ZstdInputStream
import io.mockk.every
import io.mockk.mockk
import kotlinx.datetime.LocalDateTime
import org.awaitility.Awaitility.await
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersionOriginalMetadata
import org.loculus.backend.api.Organism
import org.loculus.backend.api.Status
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.expectNdjsonAndGetContent
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jacksonObjectMapper
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.loculus.backend.service.submission.UploadDatabaseService
import org.loculus.backend.utils.MetadataEntry
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class GetOriginalMetadataEndpointTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
    @Autowired val uploadDatabaseService: UploadDatabaseService,
) {
    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse {
            submissionControllerClient.getOriginalMetadata(jwt = it)
        }
    }

    @Test
    fun `GIVEN no sequence entries in database THEN returns empty response`() {
        val response = submissionControllerClient.getOriginalMetadata()
        val responseBody = response.expectNdjsonAndGetContent<AccessionVersionOriginalMetadata>()

        response.andExpect(status().isOk)
            .andExpect(header().string("x-total-records", `is`("0")))
        assertThat(responseBody, `is`(emptyList()))
    }

    @Test
    fun `GIVEN data exists THEN returns correct number of entries`() {
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val response = submissionControllerClient.getOriginalMetadata()

        val responseBody = response.expectNdjsonAndGetContent<AccessionVersionOriginalMetadata>()

        response.andExpect(status().isOk)
            .andExpect(header().string("x-total-records", `is`(DefaultFiles.NUMBER_OF_SEQUENCES.toString())))
        assertThat(responseBody.size, `is`(DefaultFiles.NUMBER_OF_SEQUENCES))
    }

    @Test
    fun `GIVEN no specified fields THEN returns all fields`() {
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val response = submissionControllerClient.getOriginalMetadata()

        val responseBody = response.expectNdjsonAndGetContent<AccessionVersionOriginalMetadata>()
        val entry = responseBody[0]

        assertThat(entry.submitter, `is`(DEFAULT_USER_NAME))
        assertThat(entry.originalMetadata, `is`(defaultOriginalData.metadata))
    }

    @Test
    fun `GIVEN specified fields that exist THEN returns only these fields`() {
        val fields = listOf("region", "country")

        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val response = submissionControllerClient.getOriginalMetadata(fields = fields)

        val responseBody = response.expectNdjsonAndGetContent<AccessionVersionOriginalMetadata>()
        val entry = responseBody[0]

        assertThat(entry.originalMetadata, `is`(fields.associateWith { defaultOriginalData.metadata[it] }))
    }

    @Test
    fun `GIVEN a field that does not exist THEN returns null`() {
        val field = "doesNotExist"

        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val response = submissionControllerClient.getOriginalMetadata(fields = listOf(field))

        val responseBody = response.expectNdjsonAndGetContent<AccessionVersionOriginalMetadata>()
        val entry = responseBody[0]

        assertThat(entry.originalMetadata, `is`(mapOf(field to null)))
    }

    @Test
    fun `WHEN I request zstd compressed data THEN should return zstd compressed data`() {
        val entries = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val response = submissionControllerClient.getOriginalMetadata(compression = "zstd")
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
            .map { jacksonObjectMapper.readValue<AccessionVersionOriginalMetadata>(it) }

        assertThat(data, hasSize(entries.size))
        assertThat(data[0].originalMetadata, `is`(not(emptyMap())))
    }

    @Test
    fun `WHEN I filter by group, status and organism THEN should return only filtered data`() {
        val g0 = groupManagementClient.createNewGroup().andGetGroupId()
        val g1 = groupManagementClient.createNewGroup().andGetGroupId()

        val expected = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(
            organism = OTHER_ORGANISM,
            groupId = g0,
        )
        val expectedAccessionVersions = expected.map { it.displayAccessionVersion() }.toSet()

        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(organism = DEFAULT_ORGANISM, groupId = g0)
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(organism = OTHER_ORGANISM, groupId = g1)
        convenienceClient.prepareDefaultSequenceEntriesToInProcessing(organism = OTHER_ORGANISM, groupId = g0)

        val response = submissionControllerClient.getOriginalMetadata(
            organism = OTHER_ORGANISM,
            groupIdsFilter = listOf(g0),
            statusesFilter = listOf(Status.APPROVED_FOR_RELEASE),
        )
        response.andExpect(status().isOk)
            .andExpect(header().string("x-total-records", `is`(expectedAccessionVersions.count().toString())))
        val responseBody = response.expectNdjsonAndGetContent<AccessionVersionOriginalMetadata>()

        assertThat(responseBody, hasSize(expected.size))
        val responseAccessionVersions = responseBody.map { it.displayAccessionVersion() }.toSet()
        assertThat(responseAccessionVersions, `is`(expectedAccessionVersions))
    }

    @Test
    fun `GIVEN there are sequences currently being uploaded THEN endpoint remains available`() {
        val uploadId = "upload id"
        val mockUser = mockk<AuthenticatedUser>()
        every { mockUser.username }.returns("username")

        uploadDatabaseService.batchInsertMetadataInAuxTable(
            uploadId = uploadId,
            authenticatedUser = mockUser,
            groupId = 1,
            submittedOrganism = Organism("organism"),
            uploadedMetadataBatch = listOf(MetadataEntry("submission id", mapOf("key" to "value"))),
            uploadedAt = LocalDateTime(2024, 1, 1, 1, 1, 1),
            null,
        )

        submissionControllerClient.getOriginalMetadata()
            .andExpect(status().isOk)

        uploadDatabaseService.deleteUploadData(uploadId)

        submissionControllerClient.getOriginalMetadata()
            .andExpect(status().isOk)
    }

    // Regression test for https://github.com/loculus-project/loculus/issues/4036
    @Test
    fun `GIVEN revoked sequences exist THEN endpoint does not throw exception`() {
        convenienceClient.prepareRevokedSequenceEntries()
        val response = submissionControllerClient.getOriginalMetadata()
        response.andExpect(status().isOk)
        val responseBody = response.expectNdjsonAndGetContent<AccessionVersionOriginalMetadata>()
        assertThat(responseBody, hasSize(greaterThan(DefaultFiles.NUMBER_OF_SEQUENCES)))
    }
}
