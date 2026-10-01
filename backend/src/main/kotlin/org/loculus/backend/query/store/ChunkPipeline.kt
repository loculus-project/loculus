package org.loculus.backend.query.store

import java.util.concurrent.ExecutionException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Future

/**
 * Splits ids into chunks, fetches up to `prefetch` chunks ahead on [executor] and emits them in order on the
 * calling thread.
 *
 * Each background fetch holds `permitsPerChunk` permits of [limiter] (the pooled connections it uses) while it runs.
 * The permits are taken before any connection and returned as soon as the database work is done, before `prepare`
 * and long before the chunk is emitted, so a slow client never holds them. A request that fits in one chunk (a
 * sequence page, a small download) is fetched on the calling thread and takes no permit.
 */
internal class ChunkPipeline(private val limiter: ExportChunkLimiter, private val executor: ExecutorService) {
    fun <R, T> run(
        ids: IntArray,
        chunkSize: Int,
        prefetch: Int,
        permitsPerChunk: Int,
        fetch: (IntArray) -> R,
        prepare: (IntArray, R) -> T,
        emit: (IntArray, T) -> Unit,
    ) {
        val chunks = ArrayDeque<IntArray>()
        PostgresQueryStore.forEachChunk(ids, chunkSize) { chunks.addLast(it) }
        if (chunks.size == 1) {
            val chunk = chunks.single()
            emit(chunk, prepare(chunk, fetch(chunk)))
            return
        }
        val inFlight = ArrayDeque<Pair<IntArray, Future<T>>>()
        try {
            while (chunks.isNotEmpty() || inFlight.isNotEmpty()) {
                while (inFlight.size < prefetch && chunks.isNotEmpty()) {
                    val chunk = chunks.removeFirst()
                    inFlight.addLast(
                        chunk to executor.submit<T> {
                            prepare(chunk, limiter.withPermits(permitsPerChunk) { fetch(chunk) })
                        },
                    )
                }
                val (chunk, future) = inFlight.removeFirst()
                emit(chunk, await(future))
            }
        } finally {
            // interrupts workers still waiting for permits or fetching; they return their permits when they end
            inFlight.forEach { it.second.cancel(true) }
        }
    }
}

internal fun <T> await(future: Future<T>): T = try {
    future.get()
} catch (e: ExecutionException) {
    throw e.cause ?: e
}
