package org.loculus.backend.v2.config

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.loculus.backend.SpringBootTestWithoutDatabase
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@SpringBootTestWithoutDatabase
@AutoConfigureMockMvc
class AccessDocumentationTest(@Autowired private val mockMvc: MockMvc) {

    @Test
    fun `every v2 endpoint documents who may call it, and only the expected endpoints are public`() {
        val spec = mockMvc.perform(get("/api-docs"))
            .andExpect(status().isOk)
            .andReturn().response.contentAsString
            .let { jacksonObjectMapper().readTree(it) }
        val operations = spec["paths"].properties().flatMap { (path, methods) ->
            methods.properties().map { (method, operation) -> "${method.uppercase()} $path" to operation }
        }.toMap()

        val undocumented = operations.filterValues { it["x-access"] == null }.keys
        assertThat("Endpoints without x-access", undocumented, empty())

        // Making an endpoint public must be a deliberate, reviewed change: update this list together with the @Public
        val public = operations.filterValues { it["x-access"].asText() == "public" }
        assertThat(public.keys, equalTo(setOf("GET /v2/groups/{groupId}")))
        public.forEach { (name, operation) ->
            assertThat("$name requires no token", operation["security"]?.isEmpty, equalTo(true))
        }
    }
}
