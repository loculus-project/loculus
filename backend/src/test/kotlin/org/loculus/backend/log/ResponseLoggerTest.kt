package org.loculus.backend.log

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.LoculusCustomHeaders
import org.slf4j.LoggerFactory
import org.slf4j.MDC
import org.springframework.http.ResponseEntity
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.request
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.test.web.servlet.setup.StandaloneMockMvcBuilder
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import java.lang.management.ManagementFactory
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class ResponseLoggerTest {
    companion object {
        private val STREAMING_CPU_NANOS = TimeUnit.MILLISECONDS.toNanos(5)
        private const val REQUEST_ID = "test-request-id"
        private const val ORGANISM = "ebola"
    }

    private val meterRegistry = SimpleMeterRegistry()
    private val streamingController = StreamingController()

    // Real components, not stand-ins: the MDC lifecycle under test depends on their exact async behaviour.
    private val mockMvc: MockMvc = MockMvcBuilders.standaloneSetup(streamingController)
        .addInterceptors(OrganismMdcInterceptor())
        .addFilters<StandaloneMockMvcBuilder>(
            RequestIdFilter(RequestIdContext()),
            ResponseLogger(meterRegistry),
        )
        .build()

    private fun streamRequest() = get("/$ORGANISM/stream").header(LoculusCustomHeaders.REQUEST_ID, REQUEST_ID)

    private val rootLogger = LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME) as Logger
    private val logAppender = ListAppender<ILoggingEvent>()

    @BeforeEach
    fun attachAppender() {
        logAppender.start()
        rootLogger.addAppender(logAppender)
    }

    @AfterEach
    fun detachAppender() {
        rootLogger.detachAppender(logAppender)
        logAppender.stop()
        MDC.clear()
    }

    @Test
    fun `records streaming request CPU only after asynchronous work completes`() {
        val result = mockMvc.perform(streamRequest())
            .andExpect(request().asyncStarted())
            .andReturn()

        assertTrue(streamingController.streamingStarted.await(5, TimeUnit.SECONDS))
        assertNull(meterRegistry.find("loculus.http.request.cpu").timer())

        streamingController.allowStreamingToComplete.countDown()
        mockMvc.perform(asyncDispatch(result))
            .andExpect(status().isOk)
            .andExpect(content().string("streamed"))

        val timer = meterRegistry.get("loculus.http.request.cpu")
            .tag("method", "GET")
            .tag("uri", "/{organism}/stream")
            .tag("status", "200")
            .timer()
        assertEquals(1, timer.count())
        assertTrue(timer.totalTime(TimeUnit.NANOSECONDS) >= STREAMING_CPU_NANOS)
    }

    @Test
    fun `keeps the request MDC on the deferred response log line of a streaming request`() {
        completeStreamingRequest()

        // The log line runs after the request thread cleared the MDC, so it has to be restored.
        val responseLogEvent = logAppender.list.single { "Responding with status" in it.formattedMessage }
        assertEquals(REQUEST_ID, responseLogEvent.mdcPropertyMap[REQUEST_ID_MDC_KEY])
        assertEquals(ORGANISM, responseLogEvent.mdcPropertyMap[ORGANISM_MDC_KEY])
    }

    @Test
    fun `leaves no MDC behind on the thread that completes a streaming request`() {
        completeStreamingRequest()

        // A leftover organism would surface in later requests on the same thread.
        assertNull(MDC.get(ORGANISM_MDC_KEY))
        assertNull(MDC.get(REQUEST_ID_MDC_KEY))
    }

    private fun completeStreamingRequest() {
        val result = mockMvc.perform(streamRequest()).andReturn()
        streamingController.allowStreamingToComplete.countDown()
        mockMvc.perform(asyncDispatch(result)).andExpect(status().isOk)
    }

    @RestController
    private class StreamingController {
        val streamingStarted = CountDownLatch(1)
        val allowStreamingToComplete = CountDownLatch(1)

        @GetMapping("/{organism}/stream")
        fun stream(): ResponseEntity<StreamingResponseBody> = ResponseEntity.ok(
            StreamingResponseBody { outputStream ->
                streamingStarted.countDown()
                assertTrue(allowStreamingToComplete.await(5, TimeUnit.SECONDS))
                burnCpu()
                outputStream.write("streamed".toByteArray())
            },
        )

        private fun burnCpu() {
            val threadBean = ManagementFactory.getThreadMXBean()
            val start = threadBean.currentThreadCpuTime
            var value = 1.0
            while (threadBean.currentThreadCpuTime - start < STREAMING_CPU_NANOS) {
                value = Math.sqrt(value + 1)
            }
            check(value > 0)
        }
    }
}
