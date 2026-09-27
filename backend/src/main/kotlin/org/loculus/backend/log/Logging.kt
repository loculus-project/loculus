package org.loculus.backend.log

import io.micrometer.core.instrument.MeterRegistry
import jakarta.servlet.DispatcherType
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import mu.KotlinLogging
import org.loculus.backend.metrics.RequestMeasurement
import org.slf4j.MDC
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import org.springframework.web.servlet.HandlerInterceptor
import org.springframework.web.servlet.HandlerMapping
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

private val log = KotlinLogging.logger {}

const val ORGANISM_MDC_KEY = "organism"

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
            MDC.put(ORGANISM_MDC_KEY, organism)
        }

        return true
    }

    // preHandle runs again on the ASYNC dispatch, where ResponseLogger is skipped.
    override fun afterCompletion(
        request: HttpServletRequest,
        response: HttpServletResponse,
        handler: Any,
        ex: Exception?,
    ) {
        if (request.dispatcherType == DispatcherType.ASYNC) {
            MDC.remove(ORGANISM_MDC_KEY)
        }
    }
}

@Component
class ResponseLogger(private val meterRegistry: MeterRegistry) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        // The log statement may run on the async thread, which has no MDC, so the request's own MDC is kept here.
        val mdcContext = AtomicReference<Map<String, String>?>()
        val measurement = RequestMeasurement(meterRegistry, request, response) { durationNanos ->
            withMdc(mdcContext.get()) {
                log.info {
                    val duration = TimeUnit.NANOSECONDS.toMillis(durationNanos)
                    "${request.method} ${request.requestURL} - " +
                        "Responding with status ${response.status} - took ${duration}ms"
                }
            }
        }
        measurement.trackAsyncDispatch()

        var completedNormally = false
        try {
            filterChain.doFilter(request, response)
            completedNormally = true
        } finally {
            mdcContext.set(MDC.getCopyOfContextMap())
            measurement.synchronousRequestCompleted(request.isAsyncStarted, completedNormally)
            MDC.clear()
        }
    }

    // Restores the request's MDC for the log line, leaving the calling thread's own MDC intact.
    private fun withMdc(context: Map<String, String>?, block: () -> Unit) {
        if (context == null) {
            return block()
        }
        val previousContext = MDC.getCopyOfContextMap()
        MDC.setContextMap(context)
        try {
            block()
        } finally {
            if (previousContext == null) MDC.clear() else MDC.setContextMap(previousContext)
        }
    }
}
