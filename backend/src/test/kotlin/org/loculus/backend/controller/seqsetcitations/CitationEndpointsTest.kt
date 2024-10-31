package org.loculus.backend.controller.seqsetcitations

import com.jayway.jsonpath.JsonPath
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.GetSequenceResponse
import org.loculus.backend.api.ProcessingResult
import org.loculus.backend.api.SequenceEntryStatus
import org.loculus.backend.api.Status
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.service.submission.AccessionPreconditionValidator
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class CitationEndpointsTest(@Autowired private val client: SeqSetCitationsControllerClient) {
    @MockkBean
    lateinit var submissionDatabaseService: SubmissionDatabaseService

    @MockkBean
    lateinit var accessionPreconditionValidator: AccessionPreconditionValidator

    @BeforeEach
    fun setup() {
        every { accessionPreconditionValidator.validate(any()) } returns Unit
    }

    @ParameterizedTest
    @MethodSource("authorizationTestCases")
    fun `GIVEN invalid authorization token WHEN performing action THEN returns 401 Unauthorized`(scenario: Scenario) {
        expectUnauthorizedResponse(isModifyingRequest = scenario.isModifying) {
            scenario.testFunction(it, client)
        }
    }

    @Test
    fun `WHEN calling get user cited by seqSet of non-existing user THEN returns empty results`() {
        every {
            submissionDatabaseService.getSequences(any(), any(), any(), any(), any())
        } returns
            GetSequenceResponse(
                sequenceEntries = emptyList(),
                statusCounts = emptyMap(),
                processingResultCounts = emptyMap(),
            )

        client.getUserCitedBySeqSet()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.years").isArray)
            .andExpect(jsonPath("\$.years").isEmpty)
            .andExpect(jsonPath("\$.citations").isArray)
            .andExpect(jsonPath("\$.citations").isEmpty)
    }

    @Test
    fun `WHEN calling get seqSet cited by publication of non-existing seqSet THEN returns empty results`() {
        client.getSeqSetCitedByPublication()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.years").isArray)
            .andExpect(jsonPath("\$.years").isEmpty)
            .andExpect(jsonPath("\$.citations").isArray)
            .andExpect(jsonPath("\$.citations").isEmpty)
    }

    @Test
    fun `WHEN calling get seqSet cited by publication of existing seqSet THEN returns results`() {
        every {
            submissionDatabaseService.getSequences(any(), any(), any(), any(), any())
        } returns GetSequenceResponse(
            sequenceEntries = listOf(
                SequenceEntryStatus(
                    accession = "mock-sequence-accession",
                    version = 1L,
                    status = Status.APPROVED_FOR_RELEASE,
                    groupId = 123,
                    submitter = "mock-submitter",
                    isRevocation = false,
                    submissionId = "mock-submission-id",
                    dataUseTerms = DataUseTerms.Open,
                    isError = false,
                    isWarning = false,
                ),
            ),
            statusCounts = mapOf(Status.APPROVED_FOR_RELEASE to 1),
            processingResultCounts = mapOf(
                ProcessingResult.NO_ISSUES to 0,
                ProcessingResult.WARNINGS to 0,
                ProcessingResult.ERRORS to 0,
            ),
        )

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

        client.deleteSeqSet(seqSetId)
            .andExpect(status().isOk)
    }

    companion object {
        data class Scenario(
            val testFunction: (String?, SeqSetCitationsControllerClient) -> ResultActions,
            val isModifying: Boolean,
        )

        @JvmStatic
        fun authorizationTestCases(): List<Scenario> = listOf(
            Scenario({ jwt, client -> client.getUserCitedBySeqSet(jwt = jwt) }, false),
        )
    }
}
