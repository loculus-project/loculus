package org.loculus.api.config

import org.hamcrest.Matchers.hasKey
import org.junit.jupiter.api.Test
import org.loculus.api.ApiTest
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@ApiTest
class OpenApiTest(@Autowired private val mockMvc: MockMvc) {
    @Test
    fun `WHEN fetching the OpenAPI spec without authentication THEN it documents the v2 group endpoints`() {
        mockMvc.perform(get("/api-docs"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.info.version").value("v2"))
            .andExpect(jsonPath("\$.paths", hasKey("/v2/groups/{groupId}/members/{username}")))
            .andExpect(jsonPath("\$.paths", hasKey("/v2/me/groups")))
    }
}
