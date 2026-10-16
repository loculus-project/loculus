package org.loculus.backend.v2.config

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.loculus.backend.v2.controller.V2EndpointTest
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpMethod
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@V2EndpointTest
class PublicEndpointsTest(@Autowired private val mockMvc: MockMvc) {

    @Test
    fun `only the expected endpoints are public, and the API docs and the security filter chain agree on them`() {
        val spec = mockMvc.perform(get("/api-docs"))
            .andExpect(status().isOk)
            .andReturn().response.contentAsString
            .let { jacksonObjectMapper().readTree(it) }
        val endpoints = spec["paths"].properties().flatMap { (path, methods) ->
            methods.properties().map { (method, operation) ->
                Endpoint(HttpMethod.valueOf(method.uppercase()), path, operation["security"]?.isEmpty == true)
            }
        }

        // Making an endpoint public must be a deliberate, reviewed change: update this list together with V2Config
        val documentedAsPublic = endpoints.filter { it.documentedAsPublic }.map { it.toString() }
        assertThat(documentedAsPublic, contains("GET /v2/groups/{groupId}"))

        for (endpoint in endpoints) {
            val path = endpoint.path.replace(Regex("\\{[^}]+}"), "1")
            val status = mockMvc.perform(request(endpoint.method, path)).andReturn().response.status
            val rejected = status == 401 || status == 403
            assertThat("$endpoint without a token returned $status", rejected, equalTo(!endpoint.documentedAsPublic))
        }
    }

    private data class Endpoint(val method: HttpMethod, val path: String, val documentedAsPublic: Boolean) {
        override fun toString() = "$method $path"
    }
}
