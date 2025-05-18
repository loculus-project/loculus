package org.loculus.backend.controller.seqsetcitations

import org.junit.jupiter.api.Test
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.EndpointTest
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest(
    properties = ["${BackendSpringProperty.ENABLE_SEQSETS}=false"],
)
class SeqSetEndpointsDisabledTest(@Autowired private val client: SeqSetCitationsControllerClient) {
    @Test
    fun `GIVEN seqSets are disabled WHEN I get seqSets THEN returns not found`() {
        client.getSeqSet(MOCK_SEQSET_ID, MOCK_SEQSET_VERSION)
            .andExpect(status().isNotFound)
    }

    @Test
    fun `GIVEN seqSets are disabled WHEN I create seqSets THEN returns not found`() {
        client.createSeqSet()
            .andExpect(status().isNotFound)
    }
}
