package org.loculus.backend.service.submission

import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Timer
import org.springframework.stereotype.Service
import java.time.Duration

@Service
class SubmissionMetrics(private val meterRegistry: MeterRegistry) {

    // Counts how many sequence entries enter the system through submission endpoints.
    fun recordUploadedSequences(organism: String, count: Int) {
        if (count <= 0) {
            return
        }

        Counter.builder(UPLOADED_SEQUENCES_COUNTER)
            .tag(ORGANISM_TAG, organism)
            .register(meterRegistry)
            .increment(count.toDouble())
    }

    // Counts how many sequence entries are stored after preprocessing.
    fun recordProcessedSequencesStored(organism: String, count: Int) {
        if (count <= 0) {
            return
        }

        Counter.builder(PROCESSED_SEQUENCES_COUNTER)
            .tag(ORGANISM_TAG, organism)
            .register(meterRegistry)
            .increment(count.toDouble())
    }

    fun <T> timeWritePhase(operation: String, organism: String, phase: String, block: () -> T): T =
        timePhase(WRITE_PHASE_DURATION_TIMER, operation, organism, phase, block)

    fun <T> timeReadPhase(operation: String, organism: String, phase: String, block: () -> T): T =
        timePhase(READ_PHASE_DURATION_TIMER, operation, organism, phase, block)

    fun recordPollingRequest(endpoint: String, organism: String, status: String, duration: Duration) {
        if (duration.isNegative) {
            return
        }

        Timer.builder(POLLING_REQUEST_DURATION_TIMER)
            .tag(ENDPOINT_TAG, endpoint)
            .tag(ORGANISM_TAG, organism)
            .tag(STATUS_TAG, status)
            .register(meterRegistry)
            .record(duration)
    }

    private fun <T> timePhase(
        timerName: String,
        operation: String,
        organism: String,
        phase: String,
        block: () -> T,
    ): T {
        val sample = Timer.start(meterRegistry)
        return try {
            block()
        } finally {
            sample.stop(
                Timer.builder(timerName)
                    .tag(ENDPOINT_TAG, operation)
                    .tag(ORGANISM_TAG, organism)
                    .tag(PHASE_TAG, phase)
                    .register(meterRegistry),
            )
        }
    }

    private companion object {
        const val UPLOADED_SEQUENCES_COUNTER = "loculus.sequences.uploaded"
        const val PROCESSED_SEQUENCES_COUNTER = "loculus.sequences.processed"
        const val WRITE_PHASE_DURATION_TIMER = "loculus.write.phase.duration"
        const val READ_PHASE_DURATION_TIMER = "loculus.read.phase.duration"
        const val POLLING_REQUEST_DURATION_TIMER = "loculus.polling.request.duration"

        const val ORGANISM_TAG = "organism"
        const val ENDPOINT_TAG = "operation"
        const val PHASE_TAG = "phase"
        const val STATUS_TAG = "status"
    }
}
