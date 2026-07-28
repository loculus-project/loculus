package org.loculus.backend.service.submission

import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class SubmissionMetricsTest {
    private val meterRegistry = SimpleMeterRegistry()
    private val submissionMetrics = SubmissionMetrics(meterRegistry)

    @Test
    fun `write phase timer returns the block result and records its tags`() {
        val result = submissionMetrics.timeWritePhase("submit", "ebola", "store") {
            "result"
        }

        assertEquals("result", result)
        assertEquals(
            1,
            meterRegistry.get("loculus.write.phase.duration")
                .tag("operation", "submit")
                .tag("organism", "ebola")
                .tag("phase", "store")
                .timer()
                .count(),
        )
    }

    @Test
    fun `read phase timer records when the block throws`() {
        assertThrows(IllegalStateException::class.java) {
            submissionMetrics.timeReadPhase("get-released-data", "ebola", "stream") {
                throw IllegalStateException("stream failed")
            }
        }

        assertEquals(
            1,
            meterRegistry.get("loculus.read.phase.duration")
                .tag("operation", "get-released-data")
                .tag("organism", "ebola")
                .tag("phase", "stream")
                .timer()
                .count(),
        )
    }
}
