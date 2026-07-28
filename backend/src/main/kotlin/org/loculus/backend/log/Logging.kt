package org.loculus.backend.log

import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Timer
import jakarta.servlet.DispatcherType
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import mu.KotlinLogging
import org.slf4j.MDC
import org.springframework.stereotype.Component
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.context.request.async.CallableProcessingInterceptor
import org.springframework.web.context.request.async.WebAsyncUtils
import org.springframework.web.filter.OncePerRequestFilter
import org.springframework.web.servlet.HandlerInterceptor
import org.springframework.web.servlet.HandlerMapping
import java.lang.management.ManagementFactory
import java.util.concurrent.Callable
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

private val log = KotlinLogging.logger {}

const val ORGANISM_MDC_KEY = "organism"
private const val RESPONSE_LOGGER_CALLABLE_INTERCEPTOR_KEY = "responseLoggerCallableInterceptor"

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
    private val threadBean = ManagementFactory.getThreadMXBean()

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val measurement = RequestMeasurement(request, response)
        registerCallableInterceptor(request, measurement)

        var completedNormally = false
        try {
            filterChain.doFilter(request, response)
            completedNormally = true
        } finally {
            measurement.synchronousRequestCompleted(request.isAsyncStarted, completedNormally)
            MDC.clear()
        }
    }

    private fun registerCallableInterceptor(request: HttpServletRequest, measurement: RequestMeasurement) {
        // Streaming bodies run as a Callable, so CPU has to be sampled on that worker thread.
        WebAsyncUtils.getAsyncManager(request).registerCallableInterceptor(
            RESPONSE_LOGGER_CALLABLE_INTERCEPTOR_KEY,
            object : CallableProcessingInterceptor {
                private var cpuStart = -1L

                override fun <T : Any?> preProcess(request: NativeWebRequest, task: Callable<T>) {
                    cpuStart = currentThreadCpuTime()
                }

                override fun <T : Any?> postProcess(
                    request: NativeWebRequest,
                    task: Callable<T>,
                    concurrentResult: Any?,
                ) {
                    measurement.addCpuTimeSince(cpuStart)
                }

                override fun <T : Any?> afterCompletion(request: NativeWebRequest, task: Callable<T>) {
                    measurement.asynchronousRequestCompleted()
                }
            },
        )
    }

    private fun currentThreadCpuTime() =
        if (threadBean.isCurrentThreadCpuTimeSupported) threadBean.currentThreadCpuTime else -1L

    private inner class RequestMeasurement(
        private val request: HttpServletRequest,
        private val response: HttpServletResponse,
    ) {
        private val startTime = System.nanoTime()
        private val requestThreadCpuStart = currentThreadCpuTime()
        private val cpuNanos = AtomicLong()
        private val hasCpuMeasurement = AtomicBoolean()
        private val synchronousPartFinished = AtomicBoolean()
        private val asynchronousPartFinished = AtomicBoolean()
        private val recorded = AtomicBoolean()

        @Volatile
        private var asyncStarted = false

        @Volatile
        private var completedNormally = false

        @Volatile
        private var uri = "UNKNOWN"

        @Volatile
        private var mdcContext: Map<String, String>? = null

        fun synchronousRequestCompleted(asyncStarted: Boolean, completedNormally: Boolean) {
            addCpuTimeSince(requestThreadCpuStart)
            this.asyncStarted = asyncStarted
            this.completedNormally = completedNormally
            uri = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE) as? String ?: "UNKNOWN"
            // The log statement may run on the async thread, which has no MDC.
            mdcContext = MDC.getCopyOfContextMap()
            synchronousPartFinished.set(true)
            recordWhenCompleted()
        }

        fun asynchronousRequestCompleted() {
            asynchronousPartFinished.set(true)
            recordWhenCompleted()
        }

        fun addCpuTimeSince(cpuStart: Long) {
            if (cpuStart < 0) {
                return
            }
            val elapsedCpuTime = currentThreadCpuTime() - cpuStart
            if (elapsedCpuTime < 0) {
                return
            }
            hasCpuMeasurement.set(true)
            cpuNanos.addAndGet(elapsedCpuTime)
        }

        private fun recordWhenCompleted() {
            if (!synchronousPartFinished.get() ||
                (asyncStarted && !asynchronousPartFinished.get()) ||
                !recorded.compareAndSet(false, true)
            ) {
                return
            }

            if (completedNormally) {
                withRequestMdc {
                    log.info {
                        val duration = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startTime)
                        "${request.method} ${request.requestURL} - " +
                            "Responding with status ${response.status} - took ${duration}ms"
                    }
                }
            }
            if (hasCpuMeasurement.get()) {
                // Tag by the matched route template, not the raw URL, to keep metric cardinality bounded.
                Timer.builder("loculus.http.request.cpu")
                    .tag("method", request.method)
                    .tag("uri", uri)
                    .tag("status", response.status.toString())
                    .register(meterRegistry)
                    .record(cpuNanos.get(), TimeUnit.NANOSECONDS)
            }
        }

        // Restores the request's MDC for the log line, leaving the calling thread's own MDC intact.
        private fun withRequestMdc(block: () -> Unit) {
            val context = mdcContext ?: return block()
            val previousContext = MDC.getCopyOfContextMap()
            MDC.setContextMap(context)
            try {
                block()
            } finally {
                if (previousContext == null) MDC.clear() else MDC.setContextMap(previousContext)
            }
        }
    }
}
