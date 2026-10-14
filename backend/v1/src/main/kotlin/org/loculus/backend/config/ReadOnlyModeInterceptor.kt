package org.loculus.backend.config

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.loculus.backend.controller.ServiceUnavailableException
import org.springframework.web.servlet.HandlerInterceptor

class ReadOnlyModeInterceptor(private val backendConfig: BackendConfig) : HandlerInterceptor {
    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        if (backendConfig.readOnlyMode && isWriteMethod(request.method)) {
            throw ServiceUnavailableException(
                "This Loculus instance is in read-only mode; write requests are disabled.",
            )
        }
        return true
    }

    private fun isWriteMethod(method: String): Boolean = method in WRITE_METHODS

    companion object {
        private val WRITE_METHODS = setOf("POST", "PUT", "DELETE", "PATCH")
    }
}
