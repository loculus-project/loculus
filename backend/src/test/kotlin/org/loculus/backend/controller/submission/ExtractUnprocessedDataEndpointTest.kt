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
import org.loculus.backend.controller.MULTI_PATHOGEN_ORGANISM
import org.loculus.backend.controller.ORGANISM_WITHOUT_CONSENSUS_SEQUENCES
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.SegmentedMultiPathogenOrganism
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.expectForbiddenResponse
import org.loculus.backend.controller.expectNdjsonAndGetContent
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.getAccessionVersions
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
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

@EndpointTest()
class MultiPathogenExtractUnprocessedDataEndpointTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val client: SubmissionControllerClient,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
) {
    @Test
    fun `GIVEN single segmented multi pathogen submission THEN only has main sequence`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        client.submit(
            SubmitFiles.metadataFileWith(
                content = """
                    submissionId	firstColumn
                    id1	someValue
                """.trimIndent(),
            ),
            SubmitFiles.sequenceFileWith(
                content = """
                    >id1
                    A
                """.trimIndent(),
            ),
            organism = MULTI_PATHOGEN_ORGANISM,
            groupId = groupId,
        )
            .andExpect(status().isOk)

        val result = client.extractUnprocessedData(
            numberOfSequenceEntries = DefaultFiles.NUMBER_OF_SEQUENCES,
            organism = MULTI_PATHOGEN_ORGANISM,
        )
        val responseBody = result.expectNdjsonAndGetContent<UnprocessedData>()

        assertThat(responseBody.size, `is`(1))
        assertThat(
            responseBody[0].data.unalignedNucleotideSequences,
            `is`(mapOf("main" to "A")),
        )
    }

    @Test
    fun `GIVEN multi segmented multi pathogen submission THEN the segment names are the keys of the sequences`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        client.submit(
            SubmitFiles.metadataFileWith(
                content = """
                    id	firstColumn
                    id1	someValue
                    id2	someValue
                    id3	someValue
                """.trimIndent(),
            ),
            SubmitFiles.sequenceFileWith(
                content = """
                    >id1_${SegmentedMultiPathogenOrganism.FIRST_SEGMENT}
                    A
                    >id2_${SegmentedMultiPathogenOrganism.FIRST_SEGMENT}
                    AAG
                    >id2_${SegmentedMultiPathogenOrganism.SECOND_SEGMENT}
                    AAT
                    >id3_${SegmentedMultiPathogenOrganism.FIRST_SEGMENT}
                    AAAG
                    >id3_${SegmentedMultiPathogenOrganism.DIFFIRENT_SECOND_SEGMENT}
                    AAAT
                    >id3_${SegmentedMultiPathogenOrganism.THIRD_SEGMENT}
                    AAAC
                """.trimIndent(),
            ),
            organism = SegmentedMultiPathogenOrganism.NAME,
            groupId = groupId,
        )
            .andExpect(status().isOk)

        val result = client.extractUnprocessedData(
            numberOfSequenceEntries = DefaultFiles.NUMBER_OF_SEQUENCES,
            organism = SegmentedMultiPathogenOrganism.NAME,
        )
        val responseBody = result.expectNdjsonAndGetContent<UnprocessedData>()

        assertThat(responseBody.size, `is`(3))

        val firstEntry = responseBody[0]
        assertThat(firstEntry.submissionId, `is`("id1"))
        assertThat(
            firstEntry.data.unalignedNucleotideSequences,
            `is`(
                mapOf(
                    SegmentedMultiPathogenOrganism.FIRST_SEGMENT to "A",
                ),
            ),
        )

        val secondEntry = responseBody[1]
        assertThat(secondEntry.submissionId, `is`("id2"))
        assertThat(
            secondEntry.data.unalignedNucleotideSequences,
            `is`(
                mapOf(
                    SegmentedMultiPathogenOrganism.FIRST_SEGMENT to "AAG",
                    SegmentedMultiPathogenOrganism.SECOND_SEGMENT to "AAT",
                ),
            ),
        )

        val thirdEntry = responseBody[2]
        assertThat(thirdEntry.submissionId, `is`("id3"))
        assertThat(
            thirdEntry.data.unalignedNucleotideSequences,
            `is`(
                mapOf(
                    SegmentedMultiPathogenOrganism.FIRST_SEGMENT to "AAAG",
                    SegmentedMultiPathogenOrganism.DIFFIRENT_SECOND_SEGMENT to "AAAT",
                    SegmentedMultiPathogenOrganism.THIRD_SEGMENT to "AAAC",
                ),
            ),
        )
    }
}
