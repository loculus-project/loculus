package org.loculus.backend.controller.datasetcitations

import com.jayway.jsonpath.JsonPath
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.CoreMatchers.containsString
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.backend.api.Status
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.service.submission.AccessionPreconditionValidator
import org.loculus.backend.utils.Accession
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class DatasetEndpointsTest(@Autowired private val client: DatasetCitationsControllerClient) {
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
    fun `WHEN calling get dataset of non-existing id and version THEN returns not found`() {
        client.getDataset(MOCK_DATASET_ID, MOCK_DATASET_VERSION)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("Dataset $MOCK_DATASET_ID, version $MOCK_DATASET_VERSION does not exist"),
                ),
            )
    }

    @Test
    fun `WHEN calling get datasets of user THEN returns empty results`() {
        client.getDatasetsOfUser()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$").isArray)
            .andExpect(jsonPath("\$").isEmpty)
    }

    @Test
    fun `WHEN calling create dataset THEN returns created`() {
        val result = client.createDataset()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.datasetId").isString)
            .andExpect(jsonPath("\$.datasetVersion").value(1))
            .andReturn()

        val datasetId = JsonPath.read<String>(result.response.contentAsString, "$.datasetId")

        client.getDataset(datasetId, 1)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$[0].datasetId").value(datasetId))
            .andExpect(jsonPath("\$[0].datasetVersion").value(1))

        client.deleteDataset(datasetId)
            .andExpect(status().isOk)
    }

    @Test
    fun `WHEN calling create dataset with records THEN returns created`() {
        val result = client.createDataset()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.datasetId").isString)
            .andExpect(jsonPath("\$.datasetVersion").value(1))
            .andReturn()

        val datasetId = JsonPath.read<String>(result.response.contentAsString, "$.datasetId")

        client.getDatasetRecords(datasetId, 1)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$").isArray)
            .andExpect(jsonPath("\$").isNotEmpty)
            .andExpect(jsonPath("\$[0].accession").value("mock-sequence-accession.1"))
            .andExpect(jsonPath("\$[0].type").value("loculus"))

        client.deleteDataset(datasetId)
            .andExpect(status().isOk)
    }

    @Test
    fun `WHEN calling create dataset DOI THEN returns dataset with new DOI`() {
        val datasetResult = client.createDataset()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.datasetId").isString)
            .andExpect(jsonPath("\$.datasetVersion").value(1))
            .andReturn()

        val datasetId = JsonPath.read<String>(datasetResult.response.contentAsString, "$.datasetId")

        client.createDatasetDOI(datasetId)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.datasetId").isString)
            .andExpect(jsonPath("\$.datasetVersion").value(1))

        client.getDataset(datasetId, 1)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$[0].datasetDOI").isString)
    }

    @Test
    fun `WHEN calling update dataset THEN returns updated dataset`() {
        val datasetResult = client.createDataset()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.datasetId").isString)
            .andExpect(jsonPath("\$.datasetVersion").value(1))
            .andReturn()

        val datasetId = JsonPath.read<String>(datasetResult.response.contentAsString, "$.datasetId")

        val newDatasetName = "new dataset name"
        client.updateDataset(datasetId, newDatasetName)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.datasetId").isString)
            .andExpect(jsonPath("\$.datasetVersion").value(2))

        client.getDataset(datasetId, 2)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$[0].name").value(newDatasetName))

        client.deleteDataset(datasetId, 1)
            .andExpect(status().isOk)

        client.deleteDataset(datasetId, 2)
            .andExpect(status().isOk)
    }

    @Test
    fun `WHEN calling delete dataset on dataset version with a DOI THEN returns unprocessable entity`() {
        val datasetResult = client.createDataset()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.datasetId").isString)
            .andExpect(jsonPath("\$.datasetVersion").value(1))
            .andReturn()

        val datasetId = JsonPath.read<String>(datasetResult.response.contentAsString, "$.datasetId")

        client.createDatasetDOI(datasetId)
            .andExpect(status().isOk)

        client.deleteDataset(datasetId, 1)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("Dataset $datasetId, version 1 has a DOI and cannot be deleted"),
                ),
            )
    }

    @Test
    fun `WHEN calling delete dataset on dataset without a DOI THEN returns deleted`() {
        val datasetResult = client.createDataset()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.datasetId").isString)
            .andExpect(jsonPath("\$.datasetVersion").value(1))
            .andReturn()

        val datasetId = JsonPath.read<String>(datasetResult.response.contentAsString, "$.datasetId")

        client.deleteDataset(datasetId)
            .andExpect(status().isOk)

        client.getDataset(datasetId, 1)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail", containsString("Dataset $datasetId, version 1 does not exist")),
            )
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
        )
    }
}
