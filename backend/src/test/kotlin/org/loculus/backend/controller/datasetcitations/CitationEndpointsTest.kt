package org.loculus.backend.controller.datasetcitations

import com.jayway.jsonpath.JsonPath
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.GetSequenceResponse
import org.loculus.backend.api.SequenceEntryStatus
import org.loculus.backend.api.Status
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.service.submission.AccessionPreconditionValidator
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.loculus.backend.utils.Accession
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class CitationEndpointsTest(
    @Autowired private val client: DatasetCitationsControllerClient,

) {
    @MockkBean
    lateinit var submissionDatabaseService: SubmissionDatabaseService

    @MockkBean
    lateinit var accessionPreconditionValidator: AccessionPreconditionValidator

    @BeforeEach
    fun setup() {
        every {
            accessionPreconditionValidator.validateAccessionVersions(any(), any())
        } returns Unit

        every {
            accessionPreconditionValidator.validateAccessions(any<List<Accession>>(), any<List<Status>>())
        } returns listOf(
            AccessionPreconditionValidator.AccessionVersionGroup(
                accession = "MOCK_ACCESSION",
                version = 1,
                groupName = "MOCK_GROUP",
            ),
        )
    }

    @ParameterizedTest
    @MethodSource("authorizationTestCases")
    fun `GIVEN invalid authorization token WHEN performing action THEN returns 401 Unauthorized`(scenario: Scenario) {
        expectUnauthorizedResponse(isModifyingRequest = scenario.isModifying) {
            scenario.testFunction(it, client)
        }
    }

    @Test
    fun `WHEN calling get user cited by dataset of non-existing user THEN returns empty results`() {
        every {
            submissionDatabaseService.getSequences(any(), any(), any(), any(), any())
        } returns GetSequenceResponse(sequenceEntries = emptyList(), statusCounts = emptyMap())

        client.getUserCitedByDataset()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.years").isArray)
            .andExpect(jsonPath("\$.years").isEmpty)
            .andExpect(jsonPath("\$.citations").isArray)
            .andExpect(jsonPath("\$.citations").isEmpty)
    }

    @Test
    fun `WHEN calling get dataset cited by publication of non-existing dataset THEN returns empty results`() {
        client.getDatasetCitedByPublication()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.years").isArray)
            .andExpect(jsonPath("\$.years").isEmpty)
            .andExpect(jsonPath("\$.citations").isArray)
            .andExpect(jsonPath("\$.citations").isEmpty)
    }

    @Test
    fun `WHEN calling get dataset cited by publication of existing dataset THEN returns results`() {
        every {
            submissionDatabaseService.getSequences(any(), any(), any(), any(), any())
        } returns GetSequenceResponse(
            sequenceEntries = listOf(
                SequenceEntryStatus(
                    "mock-sequence-accession",
                    1L,
                    Status.APPROVED_FOR_RELEASE,
                    "mock-group",
                    false,
                    "mock-submission-id",
                    DataUseTerms.Open,
                ),
            ),
            statusCounts = mapOf(Status.APPROVED_FOR_RELEASE to 1),
        )

        val datasetResult = client.createDataset()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.datasetId").isString)
            .andExpect(jsonPath("\$.datasetVersion").value(1))
            .andReturn()

        client.getUserCitedByDataset()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.years").isArray)
            .andExpect(jsonPath("\$.years").isNotEmpty)
            .andExpect(jsonPath("\$.years[0]").isNumber)
            .andExpect(jsonPath("\$.citations").isArray)
            .andExpect(jsonPath("\$.citations").isNotEmpty)
            .andExpect(jsonPath("\$.citations[0]").value(1))

        val datasetId = JsonPath.read<String>(datasetResult.response.contentAsString, "$.datasetId")

        client.deleteDataset(datasetId)
            .andExpect(status().isOk)
    }

    companion object {
        data class Scenario(
            val testFunction: (String?, DatasetCitationsControllerClient) -> ResultActions,
            val isModifying: Boolean,
        )

        @JvmStatic
        fun authorizationTestCases(): List<Scenario> = listOf(
            Scenario({ jwt, client -> client.getUserCitedByDataset(jwt = jwt) }, false),
        )
    }
}
