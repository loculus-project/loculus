package org.loculus.backend.query.store

import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Timer
import mu.KotlinLogging
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit

private val log = KotlinLogging.logger {}

/**
 * Caps the pooled connections that bulk responses' fetch workers hold at once, across all requests, so that
 * concurrent exports leave the rest of the pool to latency-critical requests (the search table, sequence pages).
 * One permit is one connection. Permits are handed out first come, first served, so concurrent exports share the
 * budget and none starves; a single export on an idle system gets all it asks for (up to [maxPermits]).
 */
class ExportChunkLimiter(val maxPermits: Int, meterRegistry: MeterRegistry? = null) {
    init {
        require(maxPermits >= 1) { "export-max-concurrent-chunks must be at least 1, got $maxPermits" }
    }

    private val semaphore = Semaphore(maxPermits, true)
    private val waitTimer = meterRegistry?.let {
        Timer.builder(WAIT_TIMER)
            .description("Time bulk-response fetch workers wait for a connection permit")
            .register(it)
    }

    init {
        if (meterRegistry != null) {
            Gauge.builder(IN_USE_GAUGE, this) { it.inUse.toDouble() }
                .description("Connection permits held by bulk-response fetch workers")
                .register(meterRegistry)
            Gauge.builder(WAITING_GAUGE, this) { it.waiting.toDouble() }
                .description("Bulk-response fetch workers waiting for a connection permit")
                .register(meterRegistry)
            Gauge.builder(MAX_GAUGE, this) { it.maxPermits.toDouble() }
                .description("Connection permits available to bulk-response fetch workers")
                .register(meterRegistry)
        }
    }

    val inUse: Int get() = maxPermits - semaphore.availablePermits()

    /** approximate, as reported by [Semaphore.getQueueLength] */
    val waiting: Int get() = semaphore.queueLength

    /**
     * Runs [block] holding [permits] permits (at most [maxPermits], so that a chunk needing more than the whole
     * budget still runs). Waiting is interruptible; an interrupted wait holds no permit.
     */
    fun <T> withPermits(permits: Int, block: () -> T): T {
        val n = permits.coerceIn(1, maxPermits)
        val start = System.nanoTime()
        semaphore.acquire(n)
        try {
            waitTimer?.record(System.nanoTime() - start, TimeUnit.NANOSECONDS)
            return block()
        } finally {
            semaphore.release(n)
        }
    }

    companion object {
        const val IN_USE_GAUGE = "loculus_query_export_permits_in_use"
        const val WAITING_GAUGE = "loculus_query_export_permits_waiting"
        const val MAX_GAUGE = "loculus_query_export_permits_max"
        const val WAIT_TIMER = "loculus_query_export_permit_wait"

        /**
         * A third of the pool, so exports never take more than that from other requests; at least 4, so that one
         * sequence export (2 chunks ahead, 2 connections each) still runs at full parallelism on a small pool.
         */
        fun defaultMaxPermits(poolSize: Int) = maxOf(4, poolSize / 3)

        /** no effective cap (benchmarks, probes) */
        fun unlimited() = ExportChunkLimiter(Int.MAX_VALUE)
    }
}

@Configuration
@ConditionalOnProperty(prefix = "loculus.query-engine", name = ["enabled"], havingValue = "true")
class ExportChunkLimiterConfiguration {
    /**
     * `loculus.query-engine.export-max-concurrent-chunks` (default [ExportChunkLimiter.defaultMaxPermits] of the
     * Hikari pool size)
     */
    @Bean
    fun exportChunkLimiter(
        @Value("\${loculus.query-engine.export-max-concurrent-chunks:#{null}}") maxConcurrentChunks: Int?,
        @Value("\${spring.datasource.hikari.maximum-pool-size:$HIKARI_DEFAULT_POOL_SIZE}") poolSize: Int,
        meterRegistry: ObjectProvider<MeterRegistry>,
    ): ExportChunkLimiter {
        val max = maxConcurrentChunks ?: ExportChunkLimiter.defaultMaxPermits(poolSize)
        log.info { "Query engine: bulk responses hold at most $max pooled connections at once (pool size $poolSize)" }
        return ExportChunkLimiter(max, meterRegistry.ifAvailable)
    }

    private companion object {
        const val HIKARI_DEFAULT_POOL_SIZE = 10
    }
}
