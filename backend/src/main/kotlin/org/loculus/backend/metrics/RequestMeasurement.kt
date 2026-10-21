package org.loculus.backend.metrics

import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Timer
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.context.request.async.CallableProcessingInterceptor
import org.springframework.web.context.request.async.WebAsyncUtils
import org.springframework.web.servlet.HandlerMapping
import java.lang.management.ManagementFactory
import java.util.concurrent.Callable
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

private const val REQUEST_CPU_TIMER = "loculus.http.request.cpu"
private const val CALLABLE_INTERCEPTOR_KEY = "requestMeasurementCallableInterceptor"

private val threadBean = ManagementFactory.getThreadMXBean()

private fun currentThreadCpuTime() =
    if (threadBean.isCurrentThreadCpuTimeSupported) threadBean.currentThreadCpuTime else -1L

/**
 * CPU time actually burned by a request, summed across the request thread and any async worker thread.
 * Blocked I/O such as waiting on the database is excluded, so this reflects work rather than latency.
 *
 * [onCompleted] fires once, with the wall duration, when the whole request is done. It is invoked on whichever
 * thread finished last, which for streaming responses is not the request thread.
 */
class RequestMeasurement(
    private val meterRegistry: MeterRegistry,
    private val request: HttpServletRequest,
    private val response: HttpServletResponse,
    private val onCompleted: (durationNanos: Long) -> Unit,
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
    private var reportCompletion = false

    @Volatile
    private var uri = "UNKNOWN"

    // Streaming bodies run as a Callable, so CPU has to be sampled on that worker thread.
    fun trackAsyncDispatch() {
        WebAsyncUtils.getAsyncManager(request).registerCallableInterceptor(
            CALLABLE_INTERCEPTOR_KEY,
            object : CallableProcessingInterceptor {
                private var cpuStart = -1L

                override fun <T : Any> preProcess(request: NativeWebRequest, task: Callable<T>) {
                    cpuStart = currentThreadCpuTime()
                }

                override fun <T : Any> postProcess(
                    request: NativeWebRequest,
                    task: Callable<T>,
                    concurrentResult: Any?,
                ) {
                    addCpuTimeSince(cpuStart)
                }

                override fun <T : Any> afterCompletion(request: NativeWebRequest, task: Callable<T>) {
                    asynchronousPartFinished.set(true)
                    recordWhenCompleted()
                }
            },
        )
    }

    fun synchronousRequestCompleted(asyncStarted: Boolean, reportCompletion: Boolean) {
        addCpuTimeSince(requestThreadCpuStart)
        this.asyncStarted = asyncStarted
        this.reportCompletion = reportCompletion
        uri = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE) as? String ?: "UNKNOWN"
        synchronousPartFinished.set(true)
        recordWhenCompleted()
    }

    private fun addCpuTimeSince(cpuStart: Long) {
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

        if (reportCompletion) {
            onCompleted(System.nanoTime() - startTime)
        }
        if (hasCpuMeasurement.get()) {
            // Tag by the matched route template, not the raw URL, to keep metric cardinality bounded.
            Timer.builder(REQUEST_CPU_TIMER)
                .tag("method", request.method)
                .tag("uri", uri)
                .tag("status", response.status.toString())
                .register(meterRegistry)
                .record(cpuNanos.get(), TimeUnit.NANOSECONDS)
        }
    }
}
