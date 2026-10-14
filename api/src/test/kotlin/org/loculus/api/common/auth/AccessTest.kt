package org.loculus.api.common.auth

import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.api.ApiTest
import org.loculus.api.jwtForDefaultUser
import org.loculus.api.jwtForSuperUser
import org.loculus.api.withAuth
import org.loculus.apitest.AccessTestController
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.context.annotation.Import
import org.springframework.http.HttpHeaders
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@ApiTest
@Import(AccessTestController::class)
class AccessTest(@Autowired private val mockMvc: MockMvc) {

    @ParameterizedTest(name = "{0}")
    @MethodSource("cases")
    fun `endpoint access is enforced from its annotation`(case: Case) {
        val result = mockMvc.perform(get("/v2/access-test/${case.endpoint}").withAuth(case.jwt))
            .andExpect(status().`is`(case.expectedStatus))

        if (case.expectedStatus == 401) {
            result.andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, startsWith("Bearer")))
        }
    }

    companion object {
        data class Case(val caller: String, val jwt: String?, val endpoint: String, val expectedStatus: Int) {
            override fun toString() = "$caller -> $endpoint: $expectedStatus"
        }

        private val callers = listOf(
            "anonymous" to null,
            "user" to jwtForDefaultUser,
            "superuser" to jwtForSuperUser,
        )

        private val expected = mapOf(
            "public" to listOf(200, 200, 200),
            "authenticated" to listOf(401, 200, 200),
            "super-user" to listOf(401, 403, 200),
        )

        @JvmStatic
        fun cases() = expected.flatMap { (endpoint, statuses) ->
            callers.zip(statuses) { (caller, jwt), status -> Case(caller, jwt, endpoint, status) }
        } + Case("invalid token", "invalidToken", "public", 401)
    }
}
