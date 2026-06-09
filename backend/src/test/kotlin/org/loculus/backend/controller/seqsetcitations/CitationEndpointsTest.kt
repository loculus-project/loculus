package org.loculus.backend.controller.seqsetcitations

import com.jayway.jsonpath.JsonPath
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.CoreMatchers.containsString
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.CitationContributor
import org.loculus.backend.api.CitationSource
import org.loculus.backend.api.SeqSetCitationSource
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.jwtForDefaultUser
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

@EndpointTest
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
        every { crossRefService.isActive } returns false
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
        every { crossRefService.isActive } returns true
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
        every { crossRefService.isActive } returns true
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

    @Test
    fun `WHEN multiple crossref citation runs link the same citation source THEN all citations are recorded`() {
        val seqSetAResult = client.createSeqSet().andExpect(status().isOk).andReturn()
        val seqSetIdA = JsonPath.read<String>(seqSetAResult.response.contentAsString, "$.seqSetId")
        val seqSetVersionA =
            JsonPath.read<Int>(seqSetAResult.response.contentAsString, "$.seqSetVersion").toLong()
        client.createSeqSetDOI(seqSetId = seqSetIdA, seqSetVersion = seqSetVersionA).andExpect(status().isOk)
        val seqSetDOIA = "${MOCK_DOI_PREFIX}/$seqSetIdA.$seqSetVersionA"

        val seqSetBResult = client.createSeqSet().andExpect(status().isOk).andReturn()
        val seqSetIdB = JsonPath.read<String>(seqSetBResult.response.contentAsString, "$.seqSetId")
        val seqSetVersionB =
            JsonPath.read<Int>(seqSetBResult.response.contentAsString, "$.seqSetVersion").toLong()
        client.createSeqSetDOI(seqSetId = seqSetIdB, seqSetVersion = seqSetVersionB).andExpect(status().isOk)
        val seqSetDOIB = "${MOCK_DOI_PREFIX}/$seqSetIdB.$seqSetVersionB"

        every { crossRefService.isActive } returns true

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

    @Test
    fun `WHEN super user adds a curated citation THEN it is returned by get seqSet citations`() {
        val seqSetResult = client.createSeqSet().andExpect(status().isOk).andReturn()
        val seqSetId = JsonPath.read<String>(seqSetResult.response.contentAsString, "$.seqSetId")
        val seqSetVersion = JsonPath.read<Int>(seqSetResult.response.contentAsString, "$.seqSetVersion").toLong()

        client.createCuratedCitation(seqSetId = seqSetId, seqSetVersion = seqSetVersion)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.source.sourceDOI").value("10.5678/curated-paper"))

        client.getSeqSetCitations(seqSetId = seqSetId, seqSetVersion = seqSetVersion)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.length()").value(1))
            .andExpect(jsonPath("\$[0].source.sourceDOI").value("10.5678/curated-paper"))
            .andExpect(jsonPath("\$[0].source.title").value("A curated citation"))
            .andExpect(jsonPath("\$[0].source.year").value(2024))
            .andExpect(jsonPath("\$[0].source.contributors[0].givenName").value("Jane"))
            .andExpect(jsonPath("\$[0].source.contributors[0].surname").value("Doe"))
    }

    @Test
    fun `WHEN non-super user adds a curated citation THEN returns forbidden`() {
        val seqSetResult = client.createSeqSet().andExpect(status().isOk).andReturn()
        val seqSetId = JsonPath.read<String>(seqSetResult.response.contentAsString, "$.seqSetId")
        val seqSetVersion = JsonPath.read<Int>(seqSetResult.response.contentAsString, "$.seqSetVersion").toLong()

        client.createCuratedCitation(seqSetId = seqSetId, seqSetVersion = seqSetVersion, jwt = jwtForDefaultUser)
            .andExpect(status().isForbidden)

        client.getSeqSetCitations(seqSetId = seqSetId, seqSetVersion = seqSetVersion)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$").isEmpty)
    }

    @Test
    fun `WHEN super user adds a curated citation to non-existing seqSet THEN returns not found`() {
        client.createCuratedCitation(seqSetId = "does-not-exist", seqSetVersion = 1)
            .andExpect(status().isNotFound)
    }

    companion object {
        data class Scenario(
            val testFunction: (String?, SeqSetCitationsControllerClient) -> ResultActions,
            val isModifying: Boolean,
        )

        @JvmStatic
        fun authorizationTestCases(): List<Scenario> = listOf(
            Scenario({ jwt, client -> client.getUserCitedBySeqSet(jwt = jwt) }, false),
            Scenario({ jwt, client -> client.createCuratedCitation(jwt = jwt) }, true),
        )
    }
}
