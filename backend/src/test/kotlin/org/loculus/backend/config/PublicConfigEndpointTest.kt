package org.loculus.backend.config

import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class PublicConfigEndpointTest(@Autowired val mockMvc: MockMvc) {

    @Test
    fun `GET instance returns the default fixture variant`() {
        mockMvc.perform(get("/api/config/instance"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.version", equalTo(1)))
            .andExpect(jsonPath("$.config.name", equalTo("Loculus")))
            .andExpect(jsonPath("$.config.accessionPrefix", equalTo("LOC_")))
            .andExpect(jsonPath("$.config.dataUseTerms.enabled", equalTo(true)))
    }

    @Test
    fun `GET instance with explicit version 1 returns the same as latest`() {
        mockMvc.perform(get("/api/config/instance").param("version", "1"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.version", equalTo(1)))
            .andExpect(jsonPath("$.config.name", equalTo("Loculus")))
    }

    @Test
    fun `GET instance with unknown version returns 404`() {
        mockMvc.perform(get("/api/config/instance").param("version", "9999"))
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("$.error", equalTo("version_not_found")))
    }

    @Test
    fun `GET organisms returns the default fixture organisms`() {
        mockMvc.perform(get("/api/config/organisms"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.organisms.length()", equalTo(3)))
            .andExpect(
                jsonPath(
                    "$.organisms[?(@.key == 'dummyOrganism')].displayName",
                    equalTo(listOf("Displayed test organism")),
                ),
            )
    }

    @Test
    fun `GET unknown organism returns 404`() {
        mockMvc.perform(get("/api/config/organisms/nonexistent"))
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("$.error", equalTo("organism_not_found")))
    }

    @Test
    fun `GET endpoints are open - no auth required`() {
        // No withAuth() call.
        mockMvc.perform(get("/api/config/instance")).andExpect(status().isOk)
        mockMvc.perform(get("/api/config/organisms")).andExpect(status().isOk)
    }
}
