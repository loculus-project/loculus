package org.loculus.backend.controller.seqsetcitations

import com.jayway.jsonpath.JsonPath
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.CoreMatchers.containsString
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.service.crossref.CrossRefService
import org.loculus.backend.service.submission.AccessionPreconditionValidator
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class SeqSetEndpointsTest(@Autowired private val client: SeqSetCitationsControllerClient) {
    @MockkBean
    lateinit var accessionPreconditionValidator: AccessionPreconditionValidator

    @MockkBean(relaxed = true)
    lateinit var crossRefService: CrossRefService

    @BeforeEach
    fun setup() {
        every { accessionPreconditionValidator.validate(any()) } returns Unit
        every { crossRefService.postCrossRefXML(any()) } returns "SUCCESS"
    }

    @ParameterizedTest
    @MethodSource("authorizationTestCases")
    fun `GIVEN invalid authorization token WHEN performing action THEN returns 401 Unauthorized`(scenario: Scenario) {
        expectUnauthorizedResponse(isModifyingRequest = scenario.isModifying) {
            scenario.testFunction(it, client)
        }
    }

    @Test
    fun `WHEN calling get seqSet of non-existing id and version THEN returns not found`() {
        client.getSeqSet(MOCK_SEQSET_ID, MOCK_SEQSET_VERSION)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("SeqSet $MOCK_SEQSET_ID, version $MOCK_SEQSET_VERSION does not exist"),
                ),
            )
    }

    @Test
    fun `WHEN calling create seqSet THEN returns created`() {
        val result = client.createSeqSet()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.seqSetId").isString)
            .andExpect(jsonPath("\$.seqSetVersion").value(1))
            .andReturn()

        val seqSetId = JsonPath.read<String>(result.response.contentAsString, "$.seqSetId")

        client.getSeqSet(seqSetId, 1)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$[0].seqSetId").value(seqSetId))
            .andExpect(jsonPath("\$[0].seqSetVersion").value(1))

        client.deleteSeqSet(seqSetId)
            .andExpect(status().isOk)
    }

    @Test
    fun `WHEN calling create seqSet with records THEN returns created`() {
        val result = client.createSeqSet()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.seqSetId").isString)
            .andExpect(jsonPath("\$.seqSetVersion").value(1))
            .andReturn()

        val seqSetId = JsonPath.read<String>(result.response.contentAsString, "$.seqSetId")

        client.getSeqSetRecords(seqSetId, 1)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$").isArray)
            .andExpect(jsonPath("\$").isNotEmpty)
            .andExpect(jsonPath("\$[0].accession").value("mock-sequence-accession.1"))
            .andExpect(jsonPath("\$[0].type").value("loculus"))

        client.deleteSeqSet(seqSetId)
            .andExpect(status().isOk)
    }

    @Test
    fun `WHEN calling create seqSet DOI THEN returns seqSet with new DOI`() {
        val seqSetResult = client.createSeqSet()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.seqSetId").isString)
            .andExpect(jsonPath("\$.seqSetVersion").value(1))
            .andReturn()

        val seqSetId = JsonPath.read<String>(seqSetResult.response.contentAsString, "$.seqSetId")

        client.createSeqSetDOI(seqSetId)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.seqSetId").isString)
            .andExpect(jsonPath("\$.seqSetVersion").value(1))

        client.getSeqSet(seqSetId, 1)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$[0].seqSetDOI").isString)
    }

    @Test
    fun `WHEN calling update seqSet THEN returns updated seqSet`() {
        val seqSetResult = client.createSeqSet()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.seqSetId").isString)
            .andExpect(jsonPath("\$.seqSetVersion").value(1))
            .andReturn()

        val seqSetId = JsonPath.read<String>(seqSetResult.response.contentAsString, "$.seqSetId")

        val newSeqSetName = "new seqSet name"
        client.updateSeqSet(seqSetId, newSeqSetName)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.seqSetId").isString)
            .andExpect(jsonPath("\$.seqSetVersion").value(2))

        client.getSeqSet(seqSetId, 2)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$[0].name").value(newSeqSetName))

        client.deleteSeqSet(seqSetId, 1)
            .andExpect(status().isOk)

        client.deleteSeqSet(seqSetId, 2)
            .andExpect(status().isOk)
    }

    @Test
    fun `WHEN calling delete seqSet on seqSet version with a DOI THEN returns unprocessable entity`() {
        val seqSetResult = client.createSeqSet()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.seqSetId").isString)
            .andExpect(jsonPath("\$.seqSetVersion").value(1))
            .andReturn()

        val seqSetId = JsonPath.read<String>(seqSetResult.response.contentAsString, "$.seqSetId")

        client.createSeqSetDOI(seqSetId)
            .andExpect(status().isOk)

        client.deleteSeqSet(seqSetId, 1)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("SeqSet $seqSetId, version 1 has a DOI and cannot be deleted"),
                ),
            )
    }

    @Test
    fun `WHEN calling delete seqSet on seqSet without a DOI THEN returns deleted`() {
        val seqSetResult = client.createSeqSet()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.seqSetId").isString)
            .andExpect(jsonPath("\$.seqSetVersion").value(1))
            .andReturn()

        val seqSetId = JsonPath.read<String>(seqSetResult.response.contentAsString, "$.seqSetId")

        client.deleteSeqSet(seqSetId)
            .andExpect(status().isOk)

        client.getSeqSet(seqSetId, 1)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail", containsString("SeqSet $seqSetId, version 1 does not exist")),
            )
    }

    companion object {
        data class Scenario(
            val testFunction: (String?, SeqSetCitationsControllerClient) -> ResultActions,
            val isModifying: Boolean,
        )

        @JvmStatic
        fun authorizationTestCases(): List<Scenario> = listOf(
            Scenario({ jwt, client -> client.createSeqSet(MOCK_SEQSET_NAME, jwt = jwt) }, true),
            Scenario({ jwt, client -> client.updateSeqSet(MOCK_SEQSET_ID, MOCK_SEQSET_NAME, jwt = jwt) }, true),
            Scenario({ jwt, client -> client.getSeqSetsOfUser(jwt = jwt) }, false),
            Scenario({ jwt, client -> client.deleteSeqSet(MOCK_SEQSET_ID, jwt = jwt) }, true),
            Scenario(
                { jwt, client ->
                    client.createSeqSetDOI(
                        MOCK_SEQSET_ID,
                        MOCK_SEQSET_VERSION,
                        jwt = jwt,
                    )
                },
                true,
            ),
        )
    }
}
