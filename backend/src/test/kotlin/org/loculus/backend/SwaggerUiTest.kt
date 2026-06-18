package org.loculus.backend

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import org.hamcrest.core.StringContains.containsString
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
    fun `Swagger UI with Loculus bar endpoint is reachable`() {
        mockMvc.perform(get("/swagger-ui/loculus").param("url", "/api-docs/general.json"))
            .andExpect(status().isOk)
            .andExpect(content().contentTypeCompatibleWith("text/html"))
            .andExpect(content().string(containsString("Loculus home")))
            .andExpect(content().string(containsString("/api-docs/general.json")))
            .andExpect(content().string(containsString("SwaggerUIBundle")))
    }

    @Test
    fun `Scalar API reference endpoint is reachable`() {
        mockMvc.perform(get("/scalar-api-reference"))
            .andExpect(status().isOk)
            .andExpect(content().contentTypeCompatibleWith("text/html"))
            .andExpect(content().string(containsString("@scalar/api-reference")))
            .andExpect(content().string(containsString("Loculus home")))
            .andExpect(content().string(containsString("/api-docs.json")))
    }

    @Test
    fun `Scalar API reference can target a split specification`() {
        mockMvc.perform(get("/scalar-api-reference").param("url", "/api-docs/general.json"))
            .andExpect(status().isOk)
            .andExpect(content().contentTypeCompatibleWith("text/html"))
            .andExpect(content().string(containsString("@scalar/api-reference")))
            .andExpect(content().string(containsString("/api-docs/general.json")))
    }

    @Test
    fun `docs endpoints do not reflect an unknown url parameter`() {
        val injection = "</script><script>alert(1)</script>"
        mockMvc.perform(get("/swagger-ui/loculus").param("url", injection))
            .andExpect(status().isOk)
            .andExpect(content().string(org.hamcrest.core.IsNot.not(containsString(injection))))
            .andExpect(content().string(containsString("/api-docs.json")))
        mockMvc.perform(get("/scalar-api-reference").param("url", injection))
            .andExpect(status().isOk)
            .andExpect(content().string(org.hamcrest.core.IsNot.not(containsString(injection))))
            .andExpect(content().string(containsString("/api-docs.json")))
    }

    @Test
    fun `JSON API docs are available`() {
        mockMvc.perform(get("/api-docs.json"))
            .andExpect(status().isOk)
            .andExpect(content().contentType("application/json"))
            .andExpect(jsonPath("\$.openapi").exists())
            .andExpect(jsonPath("\$.paths./{organism}/submit").exists())
            .andExpect(jsonPath("\$.components.schemas.OrganismResponse.properties.publishedAt.type").value("string"))
            .andExpect(
                jsonPath("\$.components.schemas.OrganismResponse.properties.publishedAt.format").value("date-time"),
            )
            .andExpect(
                jsonPath("\$.components.schemas.OrganismResponse.properties.publishedAt.example")
                    .value("2026-05-24T12:15:55.221007"),
            )
    }

    @Test
    fun `legacy JSON API docs path is not exposed`() {
        mockMvc.perform(get("/api-docs"))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `general JSON API docs exclude query endpoints`() {
        val result = mockMvc.perform(get("/api-docs/general.json"))
            .andExpect(status().isOk)
            .andExpect(content().contentType("application/json"))
            .andExpect(jsonPath("\$.openapi").exists())
            .andExpect(jsonPath("\$.paths./{organism}/submit").exists())
            .andReturn()

        val json = ObjectMapper().readTree(result.response.contentAsString)
        assertTrue(json.get("paths").fieldNames().asSequence().none { it.startsWith("/query/") })
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
}
