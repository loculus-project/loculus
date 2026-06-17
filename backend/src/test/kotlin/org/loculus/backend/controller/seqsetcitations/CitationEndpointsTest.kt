package org.loculus.backend.controller.seqsetcitations

import com.jayway.jsonpath.JsonPath
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.Matchers.containsInAnyOrder
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.CitationContributor
import org.loculus.backend.api.CitationSource
import org.loculus.backend.api.SeqSetCitationSource
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.service.crossref.CrossRefCitedByResult
import org.loculus.backend.service.crossref.CrossRefService
import org.loculus.backend.service.seqsetcitations.SeqSetCrossRefCitationsTask
import org.loculus.backend.service.submission.AccessionPreconditionValidator
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest(
    properties = ["${BackendSpringProperty.SEQSET_CITATIONS_RUN_EVERY_MINUTES}=1"],
)
class CitationEndpointsTest(
    @Autowired private val client: SeqSetCitationsControllerClient,
    @Autowired private val seqSetCrossRefCitationsTask: SeqSetCrossRefCitationsTask,
) {
    @MockkBean
    lateinit var submissionDatabaseService: SubmissionDatabaseService

    @MockkBean
    lateinit var accessionPreconditionValidator: AccessionPreconditionValidator

    @MockkBean
    lateinit var crossRefService: CrossRefService

    @BeforeEach
    fun setup() {
        every {
            submissionDatabaseService.getApprovedUserAccessionVersions(
                match { it.username == DEFAULT_USER_NAME },
            )
        } returns listOf(AccessionVersion(MOCK_SEQ_ACCESSION, MOCK_SEQ_VERSION))
        every { accessionPreconditionValidator.validate(any()) } returns Unit
        every { crossRefService.doiPrefix } returns MOCK_DOI_PREFIX
        every { crossRefService.isActive } returns true
        every { crossRefService.isWriteEnabled } returns true
        every { crossRefService.generateCrossRefXML(any()) } returns "<doi_batch/>"
        every { crossRefService.postCrossRefXML(any()) } returns "Crossref API response"
    }

    @ParameterizedTest
    @MethodSource("authorizationTestCases")
    fun `GIVEN invalid authorization token WHEN performing action THEN returns 401 Unauthorized`(scenario: Scenario) {
        expectUnauthorizedResponse(isModifyingRequest = scenario.isModifying) {
            scenario.testFunction(it, client)
        }
    }

    @Test
    fun `WHEN calling get user cited by seqSet for user sequences not in any seqSet THEN returns empty results`() {
        client.getUserCitedBySeqSet()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.years").isArray)
            .andExpect(jsonPath("\$.years").isEmpty)
            .andExpect(jsonPath("\$.citations").isArray)
            .andExpect(jsonPath("\$.citations").isEmpty)
    }

    @Test
    fun `WHEN calling get user cited by seqSet for user sequences in a seqSet THEN returns results`() {
        val seqSetResult = client.createSeqSet()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.seqSetId").isString)
            .andExpect(jsonPath("\$.seqSetVersion").value(1))
            .andReturn()

        client.getUserCitedBySeqSet()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.years").isArray)
            .andExpect(jsonPath("\$.years").isNotEmpty)
            .andExpect(jsonPath("\$.years[0]").isNumber)
            .andExpect(jsonPath("\$.citations").isArray)
            .andExpect(jsonPath("\$.citations").isNotEmpty)
            .andExpect(jsonPath("\$.citations[0]").value(1))

        val seqSetId = JsonPath.read<String>(seqSetResult.response.contentAsString, "$.seqSetId")
        val seqSetVersion = JsonPath.read<Int>(seqSetResult.response.contentAsString, "$.seqSetVersion").toLong()

        client.deleteSeqSet(seqSetId, seqSetVersion)
            .andExpect(status().isOk)
    }

    @Test
    fun `WHEN calling get seqSet citations of non-existing seqSet THEN returns not found`() {
        client.getSeqSetCitations()
            .andExpect(status().isNotFound)
    }

    @Test
    fun `WHEN calling get seqSet citations for seqSet without crossref citations THEN returns empty list`() {
        val seqSetResult = client.createSeqSet()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.seqSetId").isString)
            .andExpect(jsonPath("\$.seqSetVersion").value(1))
            .andReturn()

        val seqSetId = JsonPath.read<String>(seqSetResult.response.contentAsString, "$.seqSetId")
        val seqSetVersion = JsonPath.read<Int>(seqSetResult.response.contentAsString, "$.seqSetVersion").toLong()

        // Simulate running the crossref citations task
        every { crossRefService.getCrossRefCitedBy(MOCK_DOI_PREFIX) } returns
            CrossRefCitedByResult(emptyList(), emptyList())
        seqSetCrossRefCitationsTask.task()

        client.getSeqSetCitations(seqSetId = seqSetId, seqSetVersion = seqSetVersion)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$").isArray)
            .andExpect(jsonPath("\$").isEmpty)

        client.deleteSeqSet(seqSetId, seqSetVersion)
            .andExpect(status().isOk)
    }

    @Test
    fun `WHEN calling get seqSet citations for seqSet with crossref citations THEN returns citations`() {
        val seqSetResult = client.createSeqSet()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.seqSetId").isString)
            .andExpect(jsonPath("\$.seqSetVersion").value(1))
            .andReturn()

        val seqSetId = JsonPath.read<String>(seqSetResult.response.contentAsString, "$.seqSetId")
        val seqSetVersion = JsonPath.read<Int>(seqSetResult.response.contentAsString, "$.seqSetVersion").toLong()
        client.createSeqSetDOI(seqSetId = seqSetId, seqSetVersion = seqSetVersion)
            .andExpect(status().isOk)

        // Simulate running the task and adding a citation source
        val seqSetDOI = "${MOCK_DOI_PREFIX}/$seqSetId.$seqSetVersion"
        val seqSetCitationSource = SeqSetCitationSource(
            CitationSource(
                sourceDOI = "10.5678/citing-paper",
                title = "A paper citing the seqSet",
                year = 2024,
                contributors = listOf(CitationContributor(givenName = "Jane", surname = "Doe")),
            ),
            seqSetDOIs = setOf(seqSetDOI),
        )
        every { crossRefService.getCrossRefCitedBy(MOCK_DOI_PREFIX) } returns
            CrossRefCitedByResult(listOf(seqSetCitationSource), emptyList())
        seqSetCrossRefCitationsTask.task()

        client.getSeqSetCitations(seqSetId = seqSetId, seqSetVersion = seqSetVersion)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$").isArray)
            .andExpect(jsonPath("\$[0].source.sourceDOI").value(seqSetCitationSource.source.sourceDOI))
            .andExpect(jsonPath("\$[0].source.title").value(seqSetCitationSource.source.title))
            .andExpect(jsonPath("\$[0].source.year").value(seqSetCitationSource.source.year))
            .andExpect(
                jsonPath(
                    "\$[0].source.contributors[0].givenName",
                ).value(seqSetCitationSource.source.contributors[0].givenName),
            )
            .andExpect(
                jsonPath(
                    "\$[0].source.contributors[0].surname",
                ).value(seqSetCitationSource.source.contributors[0].surname),
            )

        client.deleteSeqSet(seqSetId, seqSetVersion)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("SeqSet $seqSetId, version $seqSetVersion has a DOI and cannot be deleted"),
                ),
            )
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("sequenceCitationVersionCases")
    fun `WHEN getting sequence citations`(case: SequenceCitationVersionCase) {
        val citations = case.citationsMap.map { (accession, citingSourceDOI) ->
            val seqSetRecords = """[{ "accession": "$accession", "type": "loculus" }]"""
            val result = client.createSeqSet(seqSetRecords = seqSetRecords).andExpect(status().isOk).andReturn()
            val seqSetId = JsonPath.read<String>(result.response.contentAsString, "$.seqSetId")
            val seqSetVersion = JsonPath.read<Int>(result.response.contentAsString, "$.seqSetVersion").toLong()
            client.createSeqSetDOI(seqSetId = seqSetId, seqSetVersion = seqSetVersion).andExpect(status().isOk)
            SeqSetCitationSource(
                CitationSource(
                    sourceDOI = citingSourceDOI,
                    title = "A paper citing $accession",
                    year = 2024,
                    contributors = listOf(CitationContributor(givenName = "Jane", surname = "Doe")),
                ),
                seqSetDOIs = setOf("$MOCK_DOI_PREFIX/$seqSetId.$seqSetVersion"),
            )
        }

        every { crossRefService.isActive } returns true
        every { crossRefService.getCrossRefCitedBy(MOCK_DOI_PREFIX) } returns
            CrossRefCitedByResult(citations, emptyList())
        seqSetCrossRefCitationsTask.task()

        client.getSequenceCitations(accession = case.accession, version = case.version)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$").isArray)
            .andExpect(jsonPath("\$.length()").value(case.expectedCitingSourceDOIs.size))
            .andExpect(
                jsonPath("\$[*].source.sourceDOI", containsInAnyOrder(*case.expectedCitingSourceDOIs.toTypedArray())),
            )
    }

    @Test
    fun `WHEN multiple crossref citation runs link the same citation source THEN all citations are recorded`() {
        fun createSeqSetWithDOI(): Triple<String, Long, String> {
            val result = client.createSeqSet().andExpect(status().isOk).andReturn()
            val seqSetId = JsonPath.read<String>(result.response.contentAsString, "$.seqSetId")
            val seqSetVersion = JsonPath.read<Int>(result.response.contentAsString, "$.seqSetVersion").toLong()
            client.createSeqSetDOI(seqSetId, seqSetVersion).andExpect(status().isOk)
            return Triple(seqSetId, seqSetVersion, "${MOCK_DOI_PREFIX}/$seqSetId.$seqSetVersion")
        }

        val (seqSetIdA, seqSetVersionA, seqSetDOIA) = createSeqSetWithDOI()
        val (seqSetIdB, seqSetVersionB, seqSetDOIB) = createSeqSetWithDOI()

        val citationSource = SeqSetCitationSource(
            CitationSource(
                sourceDOI = "10.5678/citing-paper",
                title = "A paper citing the seqSet",
                year = 2024,
                contributors = listOf(CitationContributor(givenName = "Jane", surname = "Doe")),
            ),
            seqSetDOIs = setOf(seqSetDOIA),
        )

        // Citation source cites only seqSet A
        every { crossRefService.getCrossRefCitedBy(MOCK_DOI_PREFIX) } returns
            CrossRefCitedByResult(listOf(citationSource), emptyList())
        seqSetCrossRefCitationsTask.task()

        client.getSeqSetCitations(seqSetId = seqSetIdA, seqSetVersion = seqSetVersionA)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.length()").value(1))
            .andExpect(jsonPath("\$[0].source.sourceDOI").value(citationSource.source.sourceDOI))

        // Now, citation source also cites seqSet B
        every { crossRefService.getCrossRefCitedBy(MOCK_DOI_PREFIX) } returns
            CrossRefCitedByResult(
                listOf(citationSource.copy(seqSetDOIs = setOf(seqSetDOIA, seqSetDOIB))),
                emptyList(),
            )
        seqSetCrossRefCitationsTask.task()

        client.getSeqSetCitations(seqSetId = seqSetIdA, seqSetVersion = seqSetVersionA)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.length()").value(1))
            .andExpect(jsonPath("\$[0].source.sourceDOI").value(citationSource.source.sourceDOI))

        client.getSeqSetCitations(seqSetId = seqSetIdB, seqSetVersion = seqSetVersionB)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.length()").value(1))
            .andExpect(jsonPath("\$[0].source.sourceDOI").value(citationSource.source.sourceDOI))
    }

    companion object {
        data class Scenario(
            val testFunction: (String?, SeqSetCitationsControllerClient) -> ResultActions,
            val isModifying: Boolean,
        )

        data class SequenceCitationVersionCase(
            val description: String,
            val citationsMap: Map<String, String>,
            val accession: String,
            val version: Long?,
            val expectedCitingSourceDOIs: List<String>,
        ) {
            override fun toString() = description
        }

        @JvmStatic
        fun authorizationTestCases(): List<Scenario> = listOf(
            Scenario({ jwt, client -> client.getUserCitedBySeqSet(jwt = jwt) }, false),
        )

        @JvmStatic
        fun sequenceCitationVersionCases(): List<SequenceCitationVersionCase> {
            // Map of test accessions to citation source DOIs
            val testAccessions = listOf(
                MOCK_SEQ_ACCESSION,
                "$MOCK_SEQ_ACCESSION.1",
                "$MOCK_SEQ_ACCESSION.2",
                "$MOCK_SEQ_ACCESSION-other.1",
            )
            val citationsMap = testAccessions.associateWith { "10.5678/paper-citing-$it" }

            return listOf(
                SequenceCitationVersionCase(
                    description = "accession and version THEN returns citations for the exact accession version",
                    citationsMap = citationsMap,
                    accession = MOCK_SEQ_ACCESSION,
                    version = 1L,
                    expectedCitingSourceDOIs = listOf("10.5678/paper-citing-${MOCK_SEQ_ACCESSION}.1"),
                ),
                SequenceCitationVersionCase(
                    description = "accession only THEN returns citations for all accession versions + unversioned",
                    citationsMap = citationsMap,
                    accession = MOCK_SEQ_ACCESSION,
                    version = null,
                    expectedCitingSourceDOIs = listOf(
                        "10.5678/paper-citing-${MOCK_SEQ_ACCESSION}",
                        "10.5678/paper-citing-${MOCK_SEQ_ACCESSION}.1",
                        "10.5678/paper-citing-${MOCK_SEQ_ACCESSION}.2",
                    ),
                ),
            )
        }
    }
}
