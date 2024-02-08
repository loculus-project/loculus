package org.loculus.backend.controller.datasetcitations

import com.jayway.jsonpath.JsonPath
import org.hamcrest.CoreMatchers.containsString
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
class AuthorsEndpointTest(
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
    fun `WHEN calling get author of non-existing author THEN returns not found`() {
        client.getAuthor()
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail", containsString("Author testuser does not exist")),
            )
    }

    @Test
    fun `WHEN calling create author with valid data THEN creates and returns new author id`() {
        val result = client.createAuthor()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.authorId").isString)
            .andReturn()

        val authorId = JsonPath.read<String>(result.response.contentAsString, "$.authorId")

        client.getAuthor()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$[0].authorId").value(authorId))
            .andExpect(jsonPath("\$[0].name").value("testuser"))

        client.deleteAuthor(authorId)
            .andExpect(status().isOk)
    }

    @Test
    fun `WHEN calling update author with valid data THEN updates author with given id`() {
        val result = client.createAuthor()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.authorId").isString)
            .andReturn()

        val authorId = JsonPath.read<String>(result.response.contentAsString, "$.authorId")

        val newAuthorName = "new author name"
        client.updateAuthor(authorId, newAuthorName)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.authorId").isString)

        client.getAuthor()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$[0].name").value(newAuthorName))

        client.deleteAuthor(authorId)
            .andExpect(status().isOk)
    }

    @Test
    fun `WHEN calling delete author with valid id THEN deletes author with given id`() {
        val result = client.createAuthor()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.authorId").isString)
            .andReturn()

        val authorId = JsonPath.read<String>(result.response.contentAsString, "$.authorId")

        client.deleteAuthor(authorId)
            .andExpect(status().isOk)

        client.getAuthor()
            .andExpect(status().isNotFound())
    }

    companion object {
        data class Scenario(
            val testFunction: (String?, DatasetCitationsControllerClient) -> ResultActions,
            val isModifying: Boolean,
        )

        @JvmStatic
        fun authorizationTestCases(): List<Scenario> = listOf(
            Scenario({ jwt, client -> client.getAuthor(jwt = jwt) }, false),
            Scenario({ jwt, client ->
                client.updateAuthor(
                    MOCK_AUTHOR_ID,
                    MOCK_AUTHOR_NAME,
                    jwt = jwt,
                )
            }, true),
            Scenario({ jwt, client -> client.deleteAuthor(MOCK_AUTHOR_ID, jwt = jwt) }, true),
        )
    }
}
