package org.loculus.backend.openapi

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.databind.node.ObjectNode
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import org.loculus.backend.SpringBootTestWithoutDatabase
import org.loculus.backend.config.ORGANISM_SCHEMA_NAME
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.io.File

const val OPENAPI_SPEC_OUTPUT_ENV = "OPENAPI_SPEC_OUTPUT"

/**
 * Writes the backend's OpenAPI spec (v0) to the file named by the OPENAPI_SPEC_OUTPUT environment variable.
 * The website generates its typed backend client from that file. Skipped when the variable isn't set.
 *
 * The organism enum is dropped, because it only lists the organisms of the test config,
 * while the website must accept whatever organisms an instance is configured with.
 *
 * Run it via `npm run generate-backend-api` in the website, which also regenerates the website's types.
 */
@SpringBootTestWithoutDatabase
@AutoConfigureMockMvc
class ExportOpenApiSpec(@Autowired val mockMvc: MockMvc) {

    @Test
    fun `export OpenAPI spec`() {
        val outputPath = System.getenv(OPENAPI_SPEC_OUTPUT_ENV)
        assumeTrue(!outputPath.isNullOrBlank(), "$OPENAPI_SPEC_OUTPUT_ENV is not set")

        val spec = mockMvc.perform(get("/api-docs/v0"))
            .andExpect(status().isOk)
            .andReturn()
            .response
            .contentAsString

        // sorted keys keep the output stable, so the generated website types only change when the API does
        val objectMapper = ObjectMapper().configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true)
        val specJson = objectMapper.readTree(spec) as ObjectNode
        (specJson.path("components").path("schemas").path(ORGANISM_SCHEMA_NAME) as ObjectNode)
            .put("type", "string")
            .remove("enum")

        File(outputPath!!).apply { parentFile?.mkdirs() }
            .writeText(
                objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(
                    objectMapper.treeToValue(specJson, Map::class.java),
                ) +
                    "\n",
            )
    }
}
