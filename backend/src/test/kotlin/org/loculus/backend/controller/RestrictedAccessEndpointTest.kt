package org.loculus.backend.controller

import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest(properties = ["loculus.require-authentication=true"])
class RestrictedAccessEndpointTest(@Autowired private val mockMvc: MockMvc) {
    @Test
    fun `viewer cannot submit even directly to the API`() {
        mockMvc.perform(post("/ebola-sudan/submit").withAuth()).andExpect(status().isForbidden)
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            "/ebola-sudan/get-sequences",
            "/ebola-sudan/get-submitted-metadata",
            "/ebola-sudan/get-data-to-edit/x/1",
        ],
    )
    fun `viewer cannot read drafts`(path: String) {
        mockMvc.perform(get(path).withAuth()).andExpect(status().isForbidden)
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            "/ebola-sudan/revise",
            "/ebola-sudan/approve-processed-data",
            "/ebola-sudan/revoke",
            "/create-seqset",
            "/files/request-upload",
        ],
    )
    fun `viewer cannot mutate data`(path: String) {
        mockMvc.perform(post(path).withAuth()).andExpect(status().isForbidden)
    }

    @Test
    fun `anonymous released reads require authentication`() {
        mockMvc.perform(get("/ebola-sudan/get-released-data")).andExpect(status().isUnauthorized)
    }

    @Test
    fun `capabilities use backend policy rather than group membership`() {
        mockMvc.perform(get("/access/capabilities").withAuth())
            .andExpect(status().isOk).andExpect(jsonPath("$.canContribute").value(false))
        mockMvc.perform(get("/access/capabilities").withAuth(generateJwtFor("writer", listOf("contributor"))))
            .andExpect(status().isOk).andExpect(jsonPath("$.canContribute").value(true))
    }
}
