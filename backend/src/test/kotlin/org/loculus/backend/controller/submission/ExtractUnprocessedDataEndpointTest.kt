package org.loculus.backend.controller.submission

import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.CoreMatchers.hasItem
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.allOf
import org.hamcrest.Matchers.anEmptyMap
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.everyItem
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasEntry
import org.hamcrest.Matchers.hasProperty
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.matchesRegex
import org.hamcrest.Matchers.notNullValue
import org.junit.jupiter.api.Test
import org.loculus.backend.api.FileIdAndNameAndReadUrl
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.OriginalData
import org.loculus.backend.api.OriginalDataWithFileUrls
import org.loculus.backend.api.Status.IN_PROCESSING
import org.loculus.backend.api.Status.RECEIVED
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.ORGANISM_WITHOUT_CONSENSUS_SEQUENCES
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.expectForbiddenResponse
import org.loculus.backend.controller.expectNdjsonAndGetContent
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.getAccessionVersions
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpHeaders.ETAG
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@EndpointTest(
    properties = [
        "${BackendSpringProperty.STREAM_BATCH_SIZE}=2",
        "${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG",
    ],
)
class ExtractUnprocessedDataEndpointTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val client: SubmissionControllerClient,
) {

    @Test
    fun `GIVEN multiple concurrent clients extracting data THEN each row is only returned once and not error`() {
        // Submit some test data
        val submissionResult = convenienceClient.submitDefaultFiles()
        val accessionVersions = submissionResult.submissionIdMappings

        // Create a latch to synchronize the start of concurrent requests
        val startLatch = CountDownLatch(1)
        val completionLatch = CountDownLatch(2)

        // Store results from each client
        val client1Results = mutableListOf<UnprocessedData>()
        val client2Results = mutableListOf<UnprocessedData>()
        val client1Errors = mutableListOf<Exception>()
        val client2Errors = mutableListOf<Exception>()

        // Create two threads to simulate concurrent clients
        val client1Thread = Thread {
            try {
                startLatch.await() // Wait for signal to start
                val response = client.extractUnprocessedData(
                    numberOfSequenceEntries = DefaultFiles.NUMBER_OF_SEQUENCES,
                    organism = DEFAULT_ORGANISM,
                )
                val responseBody = response.expectNdjsonAndGetContent<UnprocessedData>()
                client1Results.addAll(responseBody)
            } catch (e: Exception) {
                client1Errors.add(e)
            } finally {
                completionLatch.countDown()
            }
        }

        val client2Thread = Thread {
            try {
                startLatch.await() // Wait for signal to start
                val response = client.extractUnprocessedData(
                    numberOfSequenceEntries = DefaultFiles.NUMBER_OF_SEQUENCES,
                    organism = DEFAULT_ORGANISM,
                )
                val responseBody = response.expectNdjsonAndGetContent<UnprocessedData>()
                client2Results.addAll(responseBody)
            } catch (e: Exception) {
                client2Errors.add(e)
            } finally {
                completionLatch.countDown()
            }
        }

        // Start both threads
        client1Thread.start()
        client2Thread.start()

        // Release both threads to make requests simultaneously
        startLatch.countDown()

        // Wait for both to complete
        completionLatch.await(30, TimeUnit.SECONDS)

        // Check for errors
        assertThat("Client 1 should not have errors", client1Errors, `is`(empty()))
        assertThat("Client 2 should not have errors", client2Errors, `is`(empty()))

        // Get all returned accessions from both clients
        val client1Accessions = client1Results.map { it.accession to it.version }.toSet()
        val client2Accessions = client2Results.map { it.accession to it.version }.toSet()

        // Check that no accession was returned to both clients
        val duplicateAccessions = client1Accessions.intersect(client2Accessions)
        assertThat(
            "No accession should be returned to both clients, but found duplicates: $duplicateAccessions",
            duplicateAccessions,
            `is`(empty()),
        )

        // Check that all submitted entries were extracted exactly once
        val allExtractedAccessions = client1Accessions.union(client2Accessions)
        val expectedAccessions = accessionVersions.map { it.accession to 1L }.toSet()

        assertThat(
            "All submitted entries should be extracted exactly once",
            allExtractedAccessions,
            `is`(expectedAccessions),
        )

        // Verify total count
        assertThat(
            "Total extracted entries should equal submitted entries",
            client1Results.size + client2Results.size,
            `is`(DefaultFiles.NUMBER_OF_SEQUENCES),
        )
    }

    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            client.extractUnprocessedData(
                1,
                jwt = it,
            )
        }
    }

    @Test
    fun `GIVEN authorization token with wrong role THEN returns 403 Forbidden`() {
        expectForbiddenResponse {
            client.extractUnprocessedData(
                1,
                jwt = jwtForDefaultUser,
            )
        }
    }

    @Test
    fun `GIVEN no sequence entries in database THEN returns empty response`() {
        val response = client.extractUnprocessedData(DefaultFiles.NUMBER_OF_SEQUENCES)

        val responseBody = response.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody, `is`(emptyList()))
    }

    @Test
    fun `GIVEN header etag equal etag from last db update THEN respond with 304, ELSE respond with data and etag`() {
        val submissionResult = convenienceClient.submitDefaultFiles()
        val response = client.extractUnprocessedData(DefaultFiles.NUMBER_OF_SEQUENCES)

        val initialEtag = response.andReturn().response.getHeader(ETAG)

        val responseBody = response.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody.size, `is`(DefaultFiles.NUMBER_OF_SEQUENCES))

        val responseAfterUpdatingTable = client.extractUnprocessedData(
            DefaultFiles.NUMBER_OF_SEQUENCES,
            ifNoneMatch = initialEtag,
        ).andExpect(status().isOk)

        val emptyResponseBody = responseAfterUpdatingTable.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(emptyResponseBody.size, `is`(0))

        val secondEtag = responseAfterUpdatingTable.andReturn().response.getHeader(ETAG)

        val responseNoNewData = client.extractUnprocessedData(
            DefaultFiles.NUMBER_OF_SEQUENCES,
            ifNoneMatch = secondEtag,
        )

        responseNoNewData.andExpect(status().isNotModified)
            .andExpect(header().doesNotExist(ETAG))
    }

    @Test
    fun `WHEN extracting unprocessed data THEN only previously not extracted sequence entries are returned`() {
        val submissionResult = convenienceClient.submitDefaultFiles()
        val accessionVersions = submissionResult.submissionIdMappings

        val result7 = client.extractUnprocessedData(7)
        val responseBody7 = result7.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody7, hasSize(7))
        assertThat(
            responseBody7,
            hasItem(
                allOf(
                    hasProperty<UnprocessedData>("accession", `is`(accessionVersions[0].accession)),
                    hasProperty("version", `is`(1L)),
                    hasProperty("data", `is`(defaultOriginalData)),
                    hasProperty("submissionId", matchesRegex("custom[0-9]")),
                    hasProperty("submitter", `is`(DEFAULT_USER_NAME)),
                    hasProperty("groupId", `is`(submissionResult.groupId)),
                    hasProperty("submittedAt", greaterThan(1_700_000_000L)),
                ),
            ),
        )

        val result3 = client.extractUnprocessedData(5)
        val responseBody3 = result3.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody3, hasSize(3))
        assertThat(
            responseBody3,
            hasItem(hasProperty<UnprocessedData>("accession", `is`(accessionVersions[7].accession))),
        )

        val result0 = client.extractUnprocessedData(DefaultFiles.NUMBER_OF_SEQUENCES)
        val responseBody0 = result0.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody0, `is`(emptyList()))
    }

    @Test
    fun `WHEN I want to extract more than allowed number of sequence entries at once THEN returns Bad Request`() {
        client.extractUnprocessedData(100_001)
            .andExpect(status().isBadRequest)
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("You can extract at max 100000 sequence entries at once."),
                ),
            )
    }

    @Test
    fun `GIVEN sequence entries for multiple organisms THEN it should only return entries for that organism`() {
        val defaultOrganismEntries = convenienceClient.submitDefaultFiles(organism = DEFAULT_ORGANISM)
            .submissionIdMappings
        val otherOrganismEntries = convenienceClient.submitDefaultFiles(organism = OTHER_ORGANISM)
            .submissionIdMappings

        val result = client.extractUnprocessedData(
            defaultOrganismEntries.size + otherOrganismEntries.size,
            organism = OTHER_ORGANISM,
        )
        val responseBody = result.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody, hasSize(otherOrganismEntries.size))

        convenienceClient.getSequenceEntry(
            accession = defaultOrganismEntries.first().accession,
            version = 1,
            organism = DEFAULT_ORGANISM,
        ).assertStatusIs(RECEIVED)
        convenienceClient.getSequenceEntry(
            accession = otherOrganismEntries.first().accession,
            version = 1,
            organism = OTHER_ORGANISM,
        ).assertStatusIs(IN_PROCESSING)

        assertThat(
            responseBody.getAccessionVersions(),
            containsInAnyOrder(*otherOrganismEntries.getAccessionVersions().toTypedArray()),
        )
        assertThat(
            defaultOrganismEntries.getAccessionVersions().intersect(responseBody.getAccessionVersions().toSet()),
            `is`(empty()),
        )
    }

    @Test
    fun `GIVEN entries for organism without consensus sequences THEN only returns metadata`() {
        val submissionResult = convenienceClient.submitDefaultFiles(organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES)
        val accessionVersions = submissionResult.submissionIdMappings

        val result = client.extractUnprocessedData(
            numberOfSequenceEntries = DefaultFiles.NUMBER_OF_SEQUENCES,
            organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES,
        )
        val responseBody = result.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody, hasSize(DefaultFiles.NUMBER_OF_SEQUENCES))
        assertThat(
            responseBody,
            hasItem(
                allOf(
                    hasProperty<UnprocessedData>("accession", `is`(accessionVersions[0].accession)),
                    hasProperty("version", `is`(1L)),
                    hasProperty(
                        "data",
                        allOf(
                            hasProperty<OriginalData<GeneticSequence>>("metadata", `is`(defaultOriginalData.metadata)),
                            hasProperty("unalignedNucleotideSequences", `is`(anEmptyMap<String, GeneticSequence>())),
                        ),
                    ),
                    hasProperty("submissionId", matchesRegex("custom[0-9]")),
                    hasProperty("submitter", `is`(DEFAULT_USER_NAME)),
                    hasProperty("groupId", `is`(submissionResult.groupId)),
                    hasProperty("submittedAt", greaterThan(1_700_000_000L)),
                ),
            ),
        )
    }

    @Test
    fun `GIVEN file mapping THEN returns file mapping with presigned URL`() {
        convenienceClient.submitDefaultFiles(includeFileMapping = true)

        val result = client.extractUnprocessedData(
            numberOfSequenceEntries = DefaultFiles.NUMBER_OF_SEQUENCES,
        )
        val responseBody = result.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody, hasSize(DefaultFiles.NUMBER_OF_SEQUENCES))
        assertThat(
            responseBody,
            everyItem(
                hasProperty(
                    "data",
                    hasProperty<OriginalDataWithFileUrls<GeneticSequence>>(
                        "files",
                        hasEntry<String, List<FileIdAndNameAndReadUrl>>(
                            `is`("myFileCategory"),
                            everyItem(
                                hasProperty("readUrl", notNullValue()),
                            ),
                        ),
                    ),
                ),
            ),
        )
    }

    @Test
    fun `GIVEN returns file mapping THEN the URLs are valid`() {
        convenienceClient.submitDefaultFiles(includeFileMapping = true)

        val result = client.extractUnprocessedData(
            numberOfSequenceEntries = DefaultFiles.NUMBER_OF_SEQUENCES,
        )
        val responseBody = result.expectNdjsonAndGetContent<UnprocessedData>()
        val url = responseBody.first().data.files!!["myFileCategory"]!!.first().readUrl

        val client = HttpClient.newHttpClient()
        val request = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .build()

        val response = client.send(request, HttpResponse.BodyHandlers.ofString())
        assertThat(response.statusCode(), `is`(200))
        assertThat(response.body(), `is`("Hello, world!"))
    }
}
