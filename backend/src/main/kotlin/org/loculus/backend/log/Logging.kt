package org.loculus.backend.log

import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Timer
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import mu.KotlinLogging
import org.slf4j.MDC
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import org.springframework.web.servlet.HandlerInterceptor
import org.springframework.web.servlet.HandlerMapping
import java.lang.management.ManagementFactory
import java.util.concurrent.TimeUnit

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
}

@Component
class ResponseLogger(private val meterRegistry: MeterRegistry) : OncePerRequestFilter() {
    private val threadBean = ManagementFactory.getThreadMXBean()

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val startTime = System.currentTimeMillis()
        // CPU time actually burned by the request thread (blocked I/O such as DB waits is excluded).
        val cpuStart = if (threadBean.isCurrentThreadCpuTimeSupported) threadBean.currentThreadCpuTime else -1L
        try {
            filterChain.doFilter(request, response)

            log.info {
                val duration = System.currentTimeMillis() - startTime
                "${request.method} ${request.requestURL} - Responding with status ${response.status} - took ${duration}ms"
            }
        } finally {
            recordCpuTime(request, response, cpuStart)
            MDC.clear()
        }
    }

    private fun recordCpuTime(request: HttpServletRequest, response: HttpServletResponse, cpuStart: Long) {
        if (cpuStart < 0) {
            return
        }
        val cpuNanos = threadBean.currentThreadCpuTime - cpuStart
        if (cpuNanos < 0) {
            return
        }
        // Tag by the matched route template, not the raw URL, to keep metric cardinality bounded.
        val uri = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE) as? String ?: "UNKNOWN"
        Timer.builder("loculus.http.request.cpu")
            .tag("method", request.method)
            .tag("uri", uri)
            .tag("status", response.status.toString())
            .register(meterRegistry)
            .record(cpuNanos, TimeUnit.NANOSECONDS)
    }
}
