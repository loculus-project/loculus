package org.loculus.api.common.config

import org.junit.jupiter.api.Test
import org.loculus.api.ApiTest
import org.loculus.api.common.auth.ACCESS_EXTENSION
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

@ApiTest
class OpenApiTest(@Autowired private val mockMvc: MockMvc, @Autowired private val jsonMapper: JsonMapper) {

    private fun fetchSpec(): JsonNode = mockMvc.perform(get("/api-docs"))
        .andExpect(status().isOk)
        .andReturn().response.contentAsString
        .let { jsonMapper.readTree(it) }

    private fun operations(spec: JsonNode): Map<String, JsonNode> = buildMap {
        spec["paths"].properties().forEach { (path, methods) ->
            methods.properties().forEach { (method, operation) -> put("${method.uppercase()} $path", operation) }
        }
    }

    @Test
    fun `every endpoint documents its access level`() {
        val operations = operations(fetchSpec())

        assert(operations.isNotEmpty())
        val undocumented = operations.filterValues { it[ACCESS_EXTENSION] == null }.keys
        assert(undocumented.isEmpty()) { "Endpoints without $ACCESS_EXTENSION: $undocumented" }
    }

    /**
     * Making an endpoint public must be a deliberate, reviewed change: update this list together with the @Public.
     */
    @Test
    fun `only the expected endpoints are public, and they need no token`() {
        val publicOperations = operations(fetchSpec()).filterValues { it[ACCESS_EXTENSION].asString() == "public" }

        assert(publicOperations.keys == setOf("GET /v2/groups/{groupId}")) { publicOperations.keys }
        publicOperations.forEach { (name, operation) ->
            assert(operation["security"]?.isEmpty == true) { "$name should have an empty security requirement" }
        }
    }
}
