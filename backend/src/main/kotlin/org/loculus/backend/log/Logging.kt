package org.loculus.backend.log

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import mu.KotlinLogging
import org.slf4j.MDC
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import org.springframework.web.servlet.HandlerInterceptor
import org.springframework.web.servlet.HandlerMapping

private val log = KotlinLogging.logger {}

@Component
class OrganismMdcInterceptor : HandlerInterceptor {
    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        val organism = try {
            when (val pathVariables = request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE)) {
                is Map<*, *> -> pathVariables["organism"] as? String
                else -> return true
            }
        } catch (e: Exception) {
            log.warn(e) { "Failed to extract organism from request: $e" }
            return true
        }

        if (organism != null) {
            MDC.put("organism", organism)
        }

        return true
    }
}

@Component
class ResponseLogger : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val startTime = System.currentTimeMillis()
        try {
            filterChain.doFilter(request, response)

            log.info {
                val duration = System.currentTimeMillis() - startTime
                "${request.method} ${request.requestURL} - Responding with status ${response.status} - took ${duration}ms"
            }
        } finally {
            MDC.clear()
        }
    }
}
