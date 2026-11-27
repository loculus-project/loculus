package org.loculus.backend.api.v0.submission

import com.fasterxml.jackson.databind.JsonNode
import com.ninjasquad.springmockk.MockkSpyBean
import io.mockk.clearMocks
import io.mockk.every
import io.mockk.verify
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.plus
import kotlinx.datetime.toInstant
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.everyItem
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.matchesPattern
import org.junit.jupiter.api.Test
import org.loculus.backend.api.v0.submission.SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.service.submission.CompressionService
import org.loculus.backend.testutil.EndpointTest
import org.loculus.backend.testutil.dateMonthsFromNow
import org.loculus.backend.testutil.expectNdjsonAndGetContent
import org.loculus.backend.types.DataUseTerms
import org.loculus.backend.types.VersionStatus
import org.loculus.backend.utils.DateProvider
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpHeaders.ETAG
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class GetReleasedDataChangesEndpointTest(
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val submissionControllerClient: SubmissionControllerClient,
) {
    @MockkSpyBean
    lateinit var dateProvider: DateProvider

    @MockkSpyBean
    lateinit var compressionService: CompressionService

    @MockkSpyBean
    lateinit var backendConfig: BackendConfig

    @Test
    fun `GIVEN no known hashes THEN returns all released data with a hash, GIVEN these hashes THEN returns no data`() {
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()

        val releasedData = submissionControllerClient.getReleasedData().expectNdjsonAndGetContent<Map<String, Any?>>()
        val changes = submissionControllerClient.getReleasedDataChanges()
            .expectNdjsonAndGetContent<Map<String, Any?>>()

        assertThat(releasedData, hasSize(NUMBER_OF_SEQUENCES))
        assertThat(changes.map { it - "hash" }, `is`(releasedData))
        assertThat(changes.map { it["hash"] as String }, everyItem(matchesPattern("^[0-9a-f]{32}$")))

        val knownHashes = changes.associate {
            (it["metadata"] as Map<*, *>)["accessionVersion"] as String to it["hash"] as String
        }
        clearMocks(compressionService, answers = false)

        val response = submissionControllerClient.getReleasedDataChanges(knownHashes)

        assertThat(response.expectNdjsonAndGetContent<JsonNode>(), `is`(empty()))
        response.andExpect(header().string("x-total-records", NUMBER_OF_SEQUENCES.toString()))
        verify(exactly = 0) { compressionService.decompress(any()) }
    }

    @Test
    fun `GIVEN a revision is released THEN returns only the new and the previous version`() {
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val accessions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease().map { it.accession }
        val knownHashes = getChanges().hashes()

        convenienceClient.reviseAndProcessDefaultSequenceEntries(accessions)

        val changes = getChanges(knownHashes)
        assertThat(
            changes.map {
                it["metadata"]["accessionVersion"].textValue() to it["metadata"]["versionStatus"].textValue()
            },
            containsInAnyOrder(
                *accessions.flatMap {
                    listOf("$it.1" to VersionStatus.REVISED.name, "$it.2" to VersionStatus.LATEST_VERSION.name)
                }.toTypedArray(),
            ),
        )
    }

    @Test
    fun `GIVEN a restriction expires THEN returns only the previously restricted data`() {
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val restrictedUntil = dateMonthsFromNow(3)
        val restrictedAccessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(
            dataUseTerms = DataUseTerms.Restricted(restrictedUntil),
        )
        val knownHashes = getChanges().hashes()

        every { dateProvider.getCurrentInstant() } returns LocalDateTime(
            date = restrictedUntil.plus(1, DateTimeUnit.DAY),
            time = LocalTime.fromSecondOfDay(0),
        ).toInstant(DateProvider.timeZone)

        assertThat(
            getChanges(knownHashes).map { it["metadata"]["accessionVersion"].textValue() },
            containsInAnyOrder(*restrictedAccessionVersions.map { it.displayAccessionVersion() }.toTypedArray()),
        )
    }

    @Test
    fun `GIVEN the etag of get-released-data THEN head responds with 304, ELSE with 200`() {
        val etag = submissionControllerClient.getReleasedData().andReturn().response.getHeader(ETAG)!!
        submissionControllerClient.getReleasedDataChanges().andExpect(header().string(ETAG, etag))

        submissionControllerClient.headReleasedDataChanges(ifNoneMatch = etag)
            .andExpect(status().isNotModified)
            .andExpect(header().string(ETAG, etag))
        submissionControllerClient.headReleasedDataChanges(ifNoneMatch = "\"outdated\"")
            .andExpect(status().isOk)
            .andExpect(header().string(ETAG, etag))
    }

    @Test
    fun `GIVEN a request body above the limit THEN responds with 413`() {
        submissionControllerClient.getReleasedDataChanges(mapOf("LOC_000001.1" to "a".repeat(MAX_KNOWN_HASHES_BYTES)))
            .andExpect(status().isContentTooLarge)
    }

    @Test
    fun `GIVEN read-only mode THEN responds with 200`() {
        every { backendConfig.readOnlyMode } returns true

        assertThat(getChanges(), `is`(empty()))
    }

    private fun getChanges(knownHashes: Map<String, String> = emptyMap()) =
        submissionControllerClient.getReleasedDataChanges(knownHashes).expectNdjsonAndGetContent<JsonNode>()

    private fun List<JsonNode>.hashes() = associate {
        it["metadata"]["accessionVersion"].textValue() to it["hash"].textValue()
    }
}
