package org.loculus.api.common.config

import org.junit.jupiter.api.Test
import org.loculus.api.ApiTest
import org.loculus.api.groups.GroupClient
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@ApiTest(properties = ["loculus.read-only-mode=true"])
class ReadOnlyModeTest(@Autowired private val client: GroupClient) {
    @Test
    fun `GIVEN read-only mode WHEN writing THEN returns 503, but reads still work`() {
        client.createGroup()
            .andExpect(status().isServiceUnavailable)
            .andExpect(
                jsonPath("\$.detail").value("This Loculus instance is in read-only mode; write requests are disabled."),
            )

        client.getGroups()
            .andExpect(status().isOk)
    }
}
