package org.loculus.backend.api.v0.admin

import org.junit.jupiter.api.Test
import org.loculus.backend.testutil.EndpointTest
import org.loculus.backend.testutil.jwtForDefaultUser
import org.loculus.backend.testutil.jwtForSuperUser
import org.loculus.backend.testutil.withAuth
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
        mockMvc.perform(get("/admin/pipeline-statistics").withAuth(jwtForDefaultUser))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `WHEN superuser THEN ok`() {
        mockMvc.perform(get("/admin/pipeline-statistics").withAuth(jwtForSuperUser))
            .andExpect(status().isOk)
    }
}
