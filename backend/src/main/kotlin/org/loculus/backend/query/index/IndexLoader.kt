package org.loculus.backend.query.index

import org.loculus.backend.query.schema.QuerySchema
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.Future

/**
 * Builds an [InMemoryOrganismIndex] from a source of id ranges, in parallel: [readers] threads read and parse
 * ranges of [chunkSize] ids (at most 2 * [readers] ranges in flight), and every range is added in id order by
 * running the index's independent bulk units (columns, sequences, mutation position ranges) in parallel.
 */
object IndexLoader {
    fun load(
        schema: QuerySchema,
        maxId: Int,
        readRange: (fromId: Int, toId: Int, consumer: (IndexRow) -> Unit) -> Unit,
        dataVersion: Long,
        readers: Int = minOf(8, maxOf(1, Runtime.getRuntime().availableProcessors() / 2)),
        chunkSize: Int = 20_000,
        localReference: Boolean = true,
        gapRuns: Boolean = true,
    ): InMemoryOrganismIndex {
        // headroom for the ids added after the load, so that the first adds do not copy every column
        val index = InMemoryOrganismIndex(schema, maxId + 1 + InMemoryOrganismIndex.capacityStep(maxId + 1))
        val units = index.bulkUnits()
        val ranges = (0..maxOf(0, maxId) step chunkSize).map { it to minOf(maxId, it + chunkSize - 1) }
        val readPool = Executors.newFixedThreadPool(readers, ::loaderThread)
        try {
            val inFlight = ArrayDeque<Future<List<IndexRow>>>()
            var next = 0
            fun submitNext() {
                val (from, to) = ranges[next++]
                inFlight.addLast(
                    readPool.submit(
                        Callable {
                            val rows = ArrayList<IndexRow>()
                            readRange(from, to) { rows.add(it) }
                            rows
                        },
                    ),
                )
            }
            while (next < ranges.size && inFlight.size < 2 * readers) submitNext()
            while (inFlight.isNotEmpty()) {
                val rows = inFlight.removeFirst().get()
                if (next < ranges.size) submitNext()
                if (rows.isNotEmpty()) indexPool.submit { units.parallelStream().forEach { it(rows) } }.get()
            }
        } finally {
            readPool.shutdownNow()
        }
        index.finishBulkLoad(dataVersion, localReference, gapRuns)
        return index
    }
}

private fun loaderThread(runnable: Runnable): Thread {
    val thread = Thread(runnable, "query-index-loader")
    thread.isDaemon = true
    return thread
}
