package org.loculus.backend.controller.dev

import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.jwtForSuperUser
import org.loculus.backend.controller.withAuth
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class PipelineStatisticsEndpointTest(@Autowired val mockMvc: MockMvc) {
    @Test
    fun `GIVEN no auth THEN unauthorized`() {
        mockMvc.perform(get("/admin/pipeline-statistics"))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `WHEN non superuser THEN forbidden`() {
        mockMvc.perform(get("/admin/pipeline-stats").withAuth(jwtForDefaultUser))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `WHEN superuser THEN ok`() {
        mockMvc.perform(get("/admin/pipeline-stats").withAuth(jwtForSuperUser))
            .andExpect(status().isOk)
    }
}
