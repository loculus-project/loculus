package org.loculus.backend.controller

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpStatus
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * On instances that set `loculus.require-authentication`, the endpoints listed in
 * `SecurityConfig.getEndpointsThatArePublic` stop being public. What is needed to operate the
 * service - health checks, the OpenAPI documents - stays reachable.
 */
@EndpointTest(properties = ["loculus.require-authentication=true"])
class RequireAuthenticationEndpointTest(@Autowired private val mockMvc: MockMvc) {

    @ParameterizedTest
    @ValueSource(
        strings = [
            "/" + DEFAULT_ORGANISM + "/get-released-data",
            "/data-use-terms/LOC_0001",
            "/get-seqset?seqSetId=someSeqSet&version=1",
            "/get-seqset-records?seqSetId=someSeqSet&version=1",
            "/get-seqset-citations?seqSetId=someSeqSet&version=1",
            "/get-sequence-citations?accession=LOC_0001",
            "/get-author?username=someUser",
            "/groups/1",
        ],
    )
    fun `GIVEN authentication is required THEN a previously public endpoint rejects anonymous requests`(
        endpoint: String,
    ) {
        mockMvc.perform(get(endpoint)).andExpect(status().isUnauthorized)
    }

    @ParameterizedTest
    @ValueSource(strings = ["/actuator/health", "/api-docs", "/favicon.ico"])
    fun `GIVEN authentication is required THEN what is needed to operate the service stays open`(endpoint: String) {
        val responseStatus = mockMvc.perform(get(endpoint)).andReturn().response.status

        assertThat(responseStatus, not(HttpStatus.UNAUTHORIZED.value()))
    }

    @Test
    fun `GIVEN authentication is required THEN released data is served to an authenticated user`() {
        mockMvc.perform(get("/$DEFAULT_ORGANISM/get-released-data").withAuth(jwtForDefaultUser))
            .andExpect(status().isOk)
    }
}
