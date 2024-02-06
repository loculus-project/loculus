package org.loculus.backend.controller.datasetcitations

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.service.KeycloakAdapter
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.ResultActions

@EndpointTest
class DatasetCitationsControllerTest(
    @Autowired private val client: DatasetCitationsControllerClient,
) {
    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    @BeforeEach
    fun setup() {
        every { keycloakAdapter.getUsersWithName(any()) } returns listOf(UserRepresentation())
    }

    @ParameterizedTest
    @MethodSource("authorizationTestCases")
    fun `GIVEN invalid authorization token WHEN performing action THEN returns 401 Unauthorized`(scenario: Scenario) {
        expectUnauthorizedResponse(isModifyingRequest = scenario.isModifying) {
            scenario.testFunction(it, client)
        }
    }

    companion object {
        data class Scenario(
            val testFunction: (String?, DatasetCitationsControllerClient) -> ResultActions,
            val isModifying: Boolean,
        )

        @JvmStatic
        fun authorizationTestCases(): List<Scenario> = listOf(
            Scenario({ jwt, client -> client.createDataset(MOCK_DATASET_NAME, jwt = jwt) }, true),
            Scenario({ jwt, client -> client.updateDataset(MOCK_DATASET_ID, MOCK_DATASET_NAME, jwt = jwt) }, true),
            Scenario({ jwt, client -> client.getDatasetsOfUser(jwt = jwt) }, false),
            Scenario({ jwt, client -> client.deleteDataset(MOCK_DATASET_ID, jwt = jwt) }, true),
            Scenario({ jwt, client ->
                client.createDatasetDOI(
                    MOCK_DATASET_ID,
                    MOCK_DATASET_VERSION,
                    jwt = jwt,
                )
            }, true),
            Scenario({ jwt, client -> client.getUserCitedByDataset(jwt = jwt) }, false),
            Scenario({ jwt, client ->
                client.getDatasetCitedByPublication(
                    MOCK_DATASET_ID,
                    MOCK_DATASET_VERSION,
                    jwt = jwt,
                )
            }, false),
            Scenario({ jwt, client -> client.getAuthor(jwt = jwt) }, false),
            Scenario({ jwt, client ->
                client.updateAuthor(
                    MOCK_AUTHOR_ID,
                    MOCK_AUTHOR_NAME,
                    jwt = jwt,
                )
            }, true),
        )
    }
}
