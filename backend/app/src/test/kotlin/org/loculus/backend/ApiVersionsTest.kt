package org.loculus.backend

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.sameInstance
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.security.web.FilterChainProxy
import org.springframework.security.web.SecurityFilterChain
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/** v1 and v2 are served side by side, each with its own security filter chain. */
@SpringBootTestWithoutDatabase
@AutoConfigureMockMvc
class ApiVersionsTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val filterChainProxy: FilterChainProxy,
    @Autowired @Qualifier("securityFilterChain") private val v1Chain: SecurityFilterChain,
    @Autowired @Qualifier("v2SecurityFilterChain") private val v2Chain: SecurityFilterChain,
) {

    @Test
    fun `requests to v2 go through v2's security filter chain, all others through v1's`() {
        fun chainFor(path: String) =
            filterChainProxy.filterChains.first { it.matches(MockHttpServletRequest("GET", path)) }

        assertThat(chainFor("/v2/groups/1"), sameInstance(v2Chain))
        assertThat(chainFor("/groups/1"), sameInstance(v1Chain))
        assertThat(chainFor("/api-docs"), sameInstance(v1Chain))
    }

    @Test
    fun `the API docs contain both versions`() {
        mockMvc.perform(get("/api-docs"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.paths['/groups/{groupId}'].get").exists())
            .andExpect(jsonPath("\$.paths['/v2/groups/{groupId}'].get.security").isArray())
            .andExpect(jsonPath("\$.paths['/v2/groups/{groupId}'].get.security").isEmpty())
    }
}
