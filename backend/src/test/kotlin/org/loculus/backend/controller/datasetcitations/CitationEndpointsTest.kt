package org.loculus.backend.controller.datasetcitations

import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectUnauthorizedResponse
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
    @ParameterizedTest
    @MethodSource("authorizationTestCases")
    fun `GIVEN invalid authorization token WHEN performing action THEN returns 401 Unauthorized`(scenario: Scenario) {
        expectUnauthorizedResponse(isModifyingRequest = scenario.isModifying) {
            scenario.testFunction(it, client)
        }
    }

    @Test
    fun `WHEN calling get user cited by dataset of non-existing user THEN returns empty results`() {
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

    companion object {
        data class Scenario(
            val testFunction: (String?, DatasetCitationsControllerClient) -> ResultActions,
            val isModifying: Boolean,
        )

        @JvmStatic
        fun authorizationTestCases(): List<Scenario> = listOf(
            Scenario({ jwt, client -> client.getUserCitedByDataset(jwt = jwt) }, false),
            Scenario({ jwt, client ->
                client.getDatasetCitedByPublication(
                    MOCK_DATASET_ID,
                    MOCK_DATASET_VERSION,
                    jwt = jwt,
                )
            }, false),
        )
    }
}
