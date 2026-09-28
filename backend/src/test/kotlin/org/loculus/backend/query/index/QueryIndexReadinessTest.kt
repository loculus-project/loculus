package org.loculus.backend.query.index

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.health.actuate.endpoint.HealthEndpointGroups
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest(
    properties = [
        "loculus.query-engine.enabled=true",
        "loculus.query-engine.config-dir=src/test/resources/query-engine",
        "loculus.query-engine.projector-initial-delay-ms=3600000",
        "loculus.query-engine.projector-interval-ms=3600000",
    ],
)
class QueryIndexReadinessTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val service: QueryIndexService,
    @Autowired private val groups: HealthEndpointGroups,
) {
    @Test
    fun `the index gates readiness only`() {
        assertThat(groups.get("readiness")!!.isMember("queryIndex"), equalTo(true))
        assertThat(groups.get("liveness")!!.isMember("queryIndex"), equalTo(false))
    }

    @Test
    fun `readiness becomes UP once the indexes are loaded`() {
        val deadline = System.currentTimeMillis() + 30_000
        while (service.organismsNotLoaded().isNotEmpty()) {
            check(System.currentTimeMillis() < deadline) { "indexes not loaded" }
            Thread.sleep(20)
        }
        mockMvc.perform(get("/actuator/health/readiness"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.status").value("UP"))
        mockMvc.perform(get("/actuator/health/liveness")).andExpect(status().isOk)
    }
}

@EndpointTest
class ReadinessWithoutQueryEngineTest(@Autowired private val mockMvc: MockMvc) {
    @Test
    fun `readiness is UP when the query engine is disabled`() {
        mockMvc.perform(get("/actuator/health/readiness"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.status").value("UP"))
    }
}
