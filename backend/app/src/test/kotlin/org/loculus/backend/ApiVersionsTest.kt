package org.loculus.backend

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/** v1 and v2 are served side by side, each with its own security filter chain. */
@SpringBootTestWithoutDatabase
@AutoConfigureMockMvc
class ApiVersionsTest(@Autowired private val mockMvc: MockMvc) {

    @Test
    fun `each version handles requests to its own paths`() {
        // v1 has CSRF protection, which rejects a write without a token as forbidden. v2 asks for a token instead.
        mockMvc.perform(post("/groups").contentType(MediaType.APPLICATION_JSON))
            .andExpect(status().isForbidden)
        mockMvc.perform(post("/v2/groups").contentType(MediaType.APPLICATION_JSON))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `the API docs contain both versions`() {
        mockMvc.perform(get("/api-docs"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.paths['/groups/{groupId}'].get['x-access']").doesNotExist())
            .andExpect(jsonPath("\$.paths['/v2/groups/{groupId}'].get['x-access']").value("public"))
    }
}
