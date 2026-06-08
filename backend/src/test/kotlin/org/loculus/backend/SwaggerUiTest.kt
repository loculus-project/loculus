package org.loculus.backend

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import org.hamcrest.core.StringContains.containsString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@SpringBootTestWithoutDatabase
@AutoConfigureMockMvc
class SwaggerUiTest(@Autowired val mockMvc: MockMvc) {

    @Test
    fun `Swagger UI endpoint is reachable`() {
        mockMvc.perform(get("/swagger-ui/index.html"))
            .andExpect(status().isOk)
            .andExpect(content().contentType("text/html"))
            .andExpect(content().string(containsString("Swagger UI")))
    }

    @Test
    fun `JSON API docs are available`() {
        mockMvc.perform(get("/api-docs"))
            .andExpect(status().isOk)
            .andExpect(content().contentType("application/json"))
            .andExpect(jsonPath("\$.openapi").exists())
            .andExpect(jsonPath("\$.paths./{organism}/submit").exists())
    }

    @Test
    fun `YAML API docs are available`() {
        val result = mockMvc.perform(get("/api-docs.yaml"))
            .andExpect(status().isOk)
            .andExpect(content().contentType("application/vnd.oai.openapi"))
            .andReturn()

        val objectMapper = ObjectMapper(YAMLFactory()).registerKotlinModule()
        val yaml = objectMapper.readTree(result.response.contentAsString)
        assertTrue(yaml.has("openapi"))
        assertTrue(yaml.get("paths").has("/{organism}/submit"))
    }

    @Test
    fun `query API docs expose guided path parameter choices`() {
        val result = mockMvc.perform(get("/api-docs"))
            .andExpect(status().isOk)
            .andReturn()

        val json = ObjectMapper().registerKotlinModule().readTree(result.response.contentAsString)
        val operation = json.get("paths").get("/query/{organism}/{versionGroup}/metadata").get("post")

        assertEquals("Query metadata", operation.get("summary").asText())
        assertEquals(listOf("Query"), operation.get("tags").map { it.asText() })
        assertEquals(
            listOf("current", "allVersions"),
            findParameter(operation, "versionGroup").get("schema").get("enum").map { it.asText() },
        )
        assertTrue(findParameter(operation, "organism").get("schema").has("enum"))
    }

    private fun findParameter(operation: JsonNode, name: String) =
        operation.get("parameters").first { it.get("name").asText() == name }
}
