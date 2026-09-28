package org.loculus.backend.query.store

import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.awaitility.Awaitility.await
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.lessThanOrEqualTo
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.assertTimeoutPreemptively
import java.io.IOException
import java.time.Duration
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.random.Random

/** [ChunkPipeline] with [ExportChunkLimiter], against a slow fake fetch that counts the fetches in flight */
class ChunkPipelineTest {
    private val executor = Executors.newVirtualThreadPerTaskExecutor()

    @AfterEach
    fun shutdown() {
        executor.shutdownNow()
    }

    /** fetches that count themselves: [inFlight] now (in permits), [maxInFlight] ever */
    private class SlowFetch(private val permits: Int = 1, private val delayMs: () -> Long = { 5 }) {
        val inFlight = AtomicInteger()
        val maxInFlight = AtomicInteger()

        fun fetch(chunk: IntArray): IntArray {
            val now = inFlight.addAndGet(permits)
            maxInFlight.accumulateAndGet(now) { a, b -> maxOf(a, b) }
            try {
                Thread.sleep(delayMs())
            } finally {
                inFlight.addAndGet(-permits)
            }
            return chunk
        }
    }

    private fun ids(n: Int) = IntArray(n) { it * 3 }

    /** runs one export and returns the ids in emitted order */
    private fun export(
        pipeline: ChunkPipeline,
        fetch: SlowFetch,
        ids: IntArray,
        prefetch: Int = 6,
        permitsPerChunk: Int = 1,
        emit: (IntArray) -> Unit = {},
    ): List<Int> {
        val out = ArrayList<Int>()
        pipeline.run(ids, 10, prefetch, permitsPerChunk, fetch::fetch, { _, fetched -> fetched.copyOf() }) { chunk, f ->
            check(chunk.contentEquals(f)) { "emitted chunk and fetch result differ" }
            emit(chunk)
            out.addAll(f.asList())
        }
        return out
    }

    private fun concurrently(n: Int, block: (Int) -> Unit) {
        val errors = Collections.synchronizedList(ArrayList<Throwable>())
        val threads = (0 until n).map { i ->
            Thread.ofVirtual().start {
                try {
                    block(i)
                } catch (e: Throwable) {
                    errors.add(e)
                }
            }
        }
        threads.forEach { it.join(30_000) }
        assertThat("export threads finished", threads.none { it.isAlive }, equalTo(true))
        assertThat(errors, equalTo(emptyList()))
    }

    @Test
    fun `concurrent exports never hold more than the cap`() {
        val limiter = ExportChunkLimiter(5)
        val pipeline = ChunkPipeline(limiter, executor)
        val fetch = SlowFetch(delayMs = { Random.nextLong(1, 6) })
        val results = arrayOfNulls<List<Int>>(8)
        concurrently(8) { i -> results[i] = export(pipeline, fetch, ids(400)) }

        assertThat(fetch.maxInFlight.get(), lessThanOrEqualTo(5))
        assertThat(fetch.maxInFlight.get(), equalTo(5))
        results.forEach { assertThat(it, equalTo(ids(400).asList())) }
        assertThat(limiter.inUse, equalTo(0))
    }

    @Test
    fun `sequence chunks count two permits each and stay under the cap`() {
        val limiter = ExportChunkLimiter(5)
        val pipeline = ChunkPipeline(limiter, executor)
        val fetch = SlowFetch(permits = 2, delayMs = { Random.nextLong(1, 6) })
        concurrently(8) { export(pipeline, fetch, ids(200), prefetch = 2, permitsPerChunk = 2) }

        assertThat(fetch.maxInFlight.get(), lessThanOrEqualTo(5))
        assertThat(limiter.inUse, equalTo(0))
    }

    @Test
    fun `a single export on an idle system gets its full parallelism`() {
        val pipeline = ChunkPipeline(ExportChunkLimiter(ExportChunkLimiter.defaultMaxPermits(30)), executor)
        val metadata = SlowFetch(delayMs = { 20 })
        export(pipeline, metadata, ids(300), prefetch = 6)
        assertThat(metadata.maxInFlight.get(), equalTo(6))

        // the smallest default budget still fits one sequence export: 2 chunks ahead with 2 connections each
        val smallPool = ChunkPipeline(ExportChunkLimiter(ExportChunkLimiter.defaultMaxPermits(10)), executor)
        val sequences = SlowFetch(permits = 2, delayMs = { 20 })
        export(smallPool, sequences, ids(300), prefetch = 2, permitsPerChunk = 2)
        assertThat(sequences.maxInFlight.get(), equalTo(4))
    }

    @Test
    fun `a cap below one request's needs still completes, in order`() {
        assertTimeoutPreemptively(Duration.ofSeconds(20)) {
            for (cap in listOf(1, 2, 3)) {
                val pipeline = ChunkPipeline(ExportChunkLimiter(cap), executor)
                val metadata = SlowFetch(delayMs = { Random.nextLong(0, 4) })
                assertThat(export(pipeline, metadata, ids(200)), equalTo(ids(200).asList()))
                assertThat(metadata.maxInFlight.get(), lessThanOrEqualTo(cap))
                // a chunk needing more permits than the cap takes the whole cap
                val sequences = SlowFetch(permits = 2, delayMs = { Random.nextLong(0, 4) })
                assertThat(
                    export(pipeline, sequences, ids(200), prefetch = 2, permitsPerChunk = 2),
                    equalTo(ids(200).asList()),
                )
            }
        }
    }

    @Test
    fun `output order does not depend on the cap or on fetch timing`() {
        val expected = ids(537).asList()
        for (cap in listOf(1, 2, 7, 1000)) {
            val pipeline = ChunkPipeline(ExportChunkLimiter(cap), executor)
            val fetch = SlowFetch(delayMs = { Random.nextLong(0, 8) })
            concurrently(4) { assertThat(export(pipeline, fetch, ids(537)), equalTo(expected)) }
        }
    }

    @Test
    fun `a short export is not starved by a long one`() {
        val pipeline = ChunkPipeline(ExportChunkLimiter(2), executor)
        val fetch = SlowFetch(delayMs = { 5 })
        val longDone = CountDownLatch(1)
        val longStarted = CountDownLatch(1)
        val long = Thread.ofVirtual().start {
            export(pipeline, fetch, ids(3000), emit = { longStarted.countDown() })
            longDone.countDown()
        }
        longStarted.await()
        export(pipeline, fetch, ids(50))
        assertThat("long export still running when the short one is done", longDone.count, equalTo(1L))
        long.join()
    }

    @Test
    fun `a client that disconnects mid-download releases its permits`() {
        val limiter = ExportChunkLimiter(4)
        val pipeline = ChunkPipeline(limiter, executor)
        val fetch = SlowFetch(delayMs = { 200 })
        var emitted = 0
        assertThrows<IOException> {
            export(pipeline, fetch, ids(1000)) { if (++emitted == 2) throw IOException("Broken pipe") }
        }
        // the cancelled workers (waiting for permits or sleeping in their fetch) end asynchronously
        await().atMost(5, TimeUnit.SECONDS).until { limiter.inUse == 0 && fetch.inFlight.get() == 0 }

        // the budget is whole again
        val next = SlowFetch(delayMs = { 20 })
        export(pipeline, next, ids(300))
        assertThat(next.maxInFlight.get(), equalTo(4))
    }

    @Test
    fun `a failing fetch aborts the export and releases every permit`() {
        val limiter = ExportChunkLimiter(3)
        val pipeline = ChunkPipeline(limiter, executor)
        val calls = AtomicInteger()
        val failure = assertThrows<IllegalStateException> {
            pipeline.run(ids(500), 10, 6, 1, { chunk ->
                if (calls.incrementAndGet() == 5) error("database went away")
                Thread.sleep(10)
                chunk
            }, { _, f -> f }) { _, _ -> }
        }
        assertThat(failure.message, equalTo("database went away"))
        await().atMost(5, TimeUnit.SECONDS).until { limiter.inUse == 0 }
    }

    @Test
    fun `a request of a single chunk takes no permit`() {
        val limiter = ExportChunkLimiter(1)
        val pipeline = ChunkPipeline(limiter, executor)
        val holding = CountDownLatch(1)
        val release = CountDownLatch(1)
        val holder = Thread.ofVirtual().start {
            limiter.withPermits(1) {
                holding.countDown()
                release.await()
            }
        }
        holding.await()
        try {
            assertTimeoutPreemptively(Duration.ofSeconds(5)) {
                assertThat(export(pipeline, SlowFetch(), ids(10)), equalTo(ids(10).asList()))
            }
        } finally {
            release.countDown()
            holder.join()
        }
    }

    @Test
    fun `permits in use and wait time are reported`() {
        val registry = SimpleMeterRegistry()
        val limiter = ExportChunkLimiter(2, registry)
        val holding = CountDownLatch(1)
        val release = CountDownLatch(1)
        val holder = Thread.ofVirtual().start {
            limiter.withPermits(2) {
                holding.countDown()
                release.await()
            }
        }
        holding.await()
        assertThat(registry.get(ExportChunkLimiter.IN_USE_GAUGE).gauge().value(), equalTo(2.0))
        assertThat(registry.get(ExportChunkLimiter.MAX_GAUGE).gauge().value(), equalTo(2.0))
        val waiter = Thread.ofVirtual().start { limiter.withPermits(1) {} }
        await().atMost(5, TimeUnit.SECONDS)
            .until { registry.get(ExportChunkLimiter.WAITING_GAUGE).gauge().value() == 1.0 }
        Thread.sleep(50)
        release.countDown()
        holder.join()
        waiter.join()
        val timer = registry.get(ExportChunkLimiter.WAIT_TIMER).timer()
        assertThat(timer.count(), equalTo(2L))
        assertThat(timer.max(TimeUnit.MILLISECONDS), greaterThan(40.0))
        assertThat(registry.get(ExportChunkLimiter.IN_USE_GAUGE).gauge().value(), equalTo(0.0))
    }
}
