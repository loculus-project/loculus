package org.loculus.backend.query.index

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.ORGANISM_WITHOUT_CONSENSUS_SEQUENCES
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.health.actuate.endpoint.HealthEndpointGroups
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest(
    properties = [
        "loculus.query-engine.enabled=true",
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

    /**
     * the test config's dummyOrganismWithoutConsensusSequences has no queryEngine section, so the pod must stay out of
     * service after all indexes loaded, while liveness stays up
     */
    @Test
    fun `readiness stays out of service while a configured organism is not queryable`() {
        val deadline = System.currentTimeMillis() + 30_000
        while (service.organismsNotLoaded().isNotEmpty()) {
            check(System.currentTimeMillis() < deadline) { "indexes not loaded" }
            Thread.sleep(20)
        }
        assertThat(service.organismsNotQueryable(), equalTo(listOf(ORGANISM_WITHOUT_CONSENSUS_SEQUENCES)))
        mockMvc.perform(get("/actuator/health/readiness"))
            .andExpect(status().isServiceUnavailable)
            .andExpect(jsonPath("\$.status").value("OUT_OF_SERVICE"))
        mockMvc.perform(get("/actuator/health/liveness"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.status").value("UP"))
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
