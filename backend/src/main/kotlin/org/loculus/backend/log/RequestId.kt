package org.loculus.backend.log

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.loculus.backend.controller.LoculusCustomHeaders.REQUEST_ID
import org.slf4j.MDC
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.web.context.annotation.RequestScope
import org.springframework.web.filter.OncePerRequestFilter
import java.util.UUID

@Component
@RequestScope
class RequestIdContext {
    var requestId: String? = null
}

const val REQUEST_ID_MDC_KEY = "RequestId"
private const val HIGH_PRECEDENCE_BUT_LOW_ENOUGH_TO_HAVE_REQUEST_SCOPE_AVAILABLE = -100
const val REQUEST_ID_HEADER_DESCRIPTION = """
A UUID that uniquely identifies the request for tracing purposes.
If none is provided in the request, the backend will generate one.
"""

@Component
@Order(HIGH_PRECEDENCE_BUT_LOW_ENOUGH_TO_HAVE_REQUEST_SCOPE_AVAILABLE)
class RequestIdFilter(private val requestIdContext: RequestIdContext) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val requestId = request.getHeader(REQUEST_ID) ?: UUID.randomUUID().toString()

        MDC.put(REQUEST_ID_MDC_KEY, requestId)
        requestIdContext.requestId = requestId
        response.addHeader(REQUEST_ID, requestId)

        try {
            filterChain.doFilter(request, response)
        } finally {
            MDC.remove(REQUEST_ID_MDC_KEY)
        }
    }
}
