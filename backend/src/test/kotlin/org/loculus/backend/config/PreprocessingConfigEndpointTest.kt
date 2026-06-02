package org.loculus.backend.config

import com.fasterxml.jackson.databind.ObjectMapper
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.jwtForLoculusAdministrator
import org.loculus.backend.controller.withAuth
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class PreprocessingConfigEndpointTest(@Autowired val mockMvc: MockMvc, @Autowired val objectMapper: ObjectMapper) {

    private val sampleConfigFile = """
        nextclade_dataset_name: nextstrain/ebola/sudan
        batch_size: 100
        processing_spec:
          country:
            function: identity
            inputs: { input: country }
    """.trimIndent()

    private fun createOrganism(key: String) {
        mockMvc.perform(
            post("/api/admin/config/organisms")
                .withAuth(jwtForLoculusAdministrator)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"key":"$key"}"""),
        ).andExpect(status().isCreated)
    }

    private fun putConfig(key: String, version: Int, body: String) = mockMvc.perform(
        put("/api/admin/config/organisms/$key/preprocessing/$version")
            .withAuth(jwtForLoculusAdministrator)
            .contentType(MediaType.TEXT_PLAIN)
            .content(body),
    )

    @Test
    fun `PUT preprocessing config requires admin auth`() {
        createOrganism("auth-org")

        // Unauthenticated write is rejected (Spring returns 4xx for the
        // anonymous state-changing request).
        mockMvc.perform(
            put("/api/admin/config/organisms/auth-org/preprocessing/1")
                .contentType(MediaType.TEXT_PLAIN)
                .content("x"),
        ).andExpect(status().is4xxClientError)

        // An authenticated non-admin user is forbidden.
        mockMvc.perform(
            put("/api/admin/config/organisms/auth-org/preprocessing/1")
                .withAuth(jwtForDefaultUser)
                .contentType(MediaType.TEXT_PLAIN)
                .content("x"),
        ).andExpect(status().isForbidden)
    }

    @Test
    fun `public GET returns 404 when no config file is set`() {
        createOrganism("empty-prepro-org")
        mockMvc.perform(get("/api/config/organisms/empty-prepro-org/preprocessing/1"))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `full flow - PUT, public GET returns raw text, list shows version, DELETE removes it`() {
        createOrganism("prepro-org")

        putConfig("prepro-org", 1, sampleConfigFile).andExpect(status().isNoContent)

        // Public read returns the exact bytes as text/plain
        mockMvc.perform(get("/api/config/organisms/prepro-org/preprocessing/1"))
            .andExpect(status().isOk)
            .andExpect(content().string(sampleConfigFile))

        // Listing includes the version
        mockMvc.perform(get("/api/config/organisms/prepro-org/preprocessing"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.versions[0].pipelineVersion", equalTo(1)))
            .andExpect(jsonPath("$.versions[0].updatedBy").exists())

        // Delete then GET 404
        mockMvc.perform(
            delete("/api/admin/config/organisms/prepro-org/preprocessing/1").withAuth(jwtForLoculusAdministrator),
        ).andExpect(status().isNoContent)
        mockMvc.perform(get("/api/config/organisms/prepro-org/preprocessing/1"))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `PUT replaces existing content`() {
        createOrganism("replace-org")
        putConfig("replace-org", 1, "first").andExpect(status().isNoContent)
        putConfig("replace-org", 1, "second").andExpect(status().isNoContent)
        mockMvc.perform(get("/api/config/organisms/replace-org/preprocessing/1"))
            .andExpect(status().isOk)
            .andExpect(content().string("second"))
    }

    @Test
    fun `pipeline versions are independent`() {
        createOrganism("multi-version-org")
        putConfig("multi-version-org", 1, "config-v1").andExpect(status().isNoContent)
        putConfig("multi-version-org", 2, "config-v2").andExpect(status().isNoContent)

        mockMvc.perform(get("/api/config/organisms/multi-version-org/preprocessing/1"))
            .andExpect(content().string("config-v1"))
        mockMvc.perform(get("/api/config/organisms/multi-version-org/preprocessing/2"))
            .andExpect(content().string("config-v2"))

        val result = mockMvc.perform(get("/api/config/organisms/multi-version-org/preprocessing"))
            .andExpect(status().isOk)
            .andReturn()
        val versions = objectMapper.readTree(result.response.contentAsString)["versions"]
            .map { it["pipelineVersion"].asLong() }
        assertThat(versions, containsInAnyOrder(1L, 2L))
    }

    @Test
    fun `PUT on a non-existent organism returns 404`() {
        putConfig("no-such-organism", 1, "x")
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("$.error", equalTo("organism_not_found")))
    }
}
