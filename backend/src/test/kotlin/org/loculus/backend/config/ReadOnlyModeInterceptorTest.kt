package org.loculus.backend.config

import io.mockk.every
import io.mockk.mockk
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertDoesNotThrow
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.controller.ServiceUnavailableException

class ReadOnlyModeInterceptorTest {
    private val response: HttpServletResponse = mockk(relaxed = true)
    private val handler: Any = Any()

    @Test
    fun `GIVEN readOnlyMode disabled THEN all methods pass`() {
        val config = backendConfig(readOnly = false)
        val interceptor = ReadOnlyModeInterceptor(config)

        for (method in listOf("GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE")) {
            assertDoesNotThrow("$method should pass when readOnlyMode is off") {
                assertThat(interceptor.preHandle(request(method), response, handler), `is`(true))
            }
        }
    }

    @Test
    fun `GIVEN readOnlyMode enabled THEN read methods pass`() {
        val config = backendConfig(readOnly = true)
        val interceptor = ReadOnlyModeInterceptor(config)

        for (method in listOf("GET", "HEAD", "OPTIONS")) {
            assertDoesNotThrow("$method should pass when readOnlyMode is on") {
                assertThat(interceptor.preHandle(request(method), response, handler), `is`(true))
            }
        }
    }

    @Test
    fun `GIVEN readOnlyMode enabled THEN write methods throw ServiceUnavailableException`() {
        val config = backendConfig(readOnly = true)
        val interceptor = ReadOnlyModeInterceptor(config)

        for (method in listOf("POST", "PUT", "PATCH", "DELETE")) {
            val thrown = assertThrows<ServiceUnavailableException>("$method should be rejected") {
                interceptor.preHandle(request(method), response, handler)
            }
            assertThat(thrown.message, `is`("This Loculus instance is in read-only mode; write requests are disabled."))
        }
    }

    private fun request(method: String): HttpServletRequest {
        val request: HttpServletRequest = mockk()
        every { request.method } returns method
        return request
    }

    private fun backendConfig(readOnly: Boolean): BackendConfig {
        val config: BackendConfig = mockk()
        every { config.readOnlyMode } returns readOnly
        return config
    }
}
