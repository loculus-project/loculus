package org.loculus.backend.query.index

import org.roaringbitmap.RoaringBitmap
import org.roaringbitmap.RoaringBitmapWriter

/**
 * Missing-symbol runs of one sequence, per 65536-id chunk, in CSR layout: `offsets[local]..offsets[local + 1]`
 * index the runs of id `chunk << 16 | local` in `data`, one Int per run `(start << 16) | endExclusive` for
 * sequences shorter than 65535 (else two Ints per run).
 *
 * Counting missing symbols per position over a filter reads only the runs of the filtered ids (parallel per
 * chunk); point queries ("which ids are missing at p") scan the compact data of all chunks in parallel.
 * Writes: appends in ascending id order during the bulk load; incremental updates rebuild the affected chunks
 * outside the write lock ([rebuild]) and swap them in ([install]).
 */
internal class RunTable(private val length: Int) {
    private val wide = length + 1 >= 0xffff
    private val width = if (wide) 2 else 1

    /** one chunk: offsets (65537 entries) and run data */
    class Chunk(val offsets: IntArray, val data: IntArray)

    private var chunks: Array<Chunk?> = arrayOfNulls(16)

    // bulk load state of the chunk being appended to
    private var buildChunk = -1
    private var buildOffsets = IntArray(0)
    private var buildData = IntArray(0)
    private var buildSize = 0
    private var buildLastLocal = -1

    val runCount: Long get() = chunks.sumOf { (it?.offsets?.get(65536) ?: 0).toLong() } / width

    fun memoryBytes(): Long =
        chunks.sumOf { c -> if (c == null) 0L else c.offsets.size * 4L + c.data.size * 4L } + buildBufferBytes()

    /** bulk-load buffers still held (0 once the load is complete) */
    internal fun buildBufferBytes(): Long = buildOffsets.size * 4L + buildData.size * 4L

    private fun ensureChunk(chunk: Int) {
        if (chunk >= chunks.size) chunks = chunks.copyOf(maxOf(chunk + 1, chunks.size * 2))
    }

    /** bulk load: all runs of an id, ids in ascending order ([start], [end] clamped to the sequence) */
    fun append(id: Int, start: Int, end: Int) {
        val chunk = id ushr 16
        val local = id and 0xffff
        val outOfOrder = if (chunk == buildChunk) local < buildLastLocal else chunks.getOrNull(chunk) != null
        if (outOfOrder) {
            // not ascending (only in tests / duplicate rows): rebuild the chunk
            install(rebuild(RoaringBitmap(), intArrayOf(id, start, end)))
            return
        }
        if (chunk != buildChunk) {
            finishBuildChunk()
            buildChunk = chunk
            buildOffsets = IntArray(65537)
            buildData = IntArray(4096)
            buildSize = 0
            buildLastLocal = -1
        }
        // offsets of locals up to and including this one start at the current size
        for (l in buildLastLocal + 1..local) buildOffsets[l] = buildSize
        buildLastLocal = local
        if (buildSize + width > buildData.size) buildData = buildData.copyOf(buildData.size * 2)
        write(buildData, buildSize, start, end)
        buildSize += width
    }

    /** completes the bulk load */
    fun trim() = finishBuildChunk()

    private fun finishBuildChunk() {
        if (buildChunk < 0) return
        for (l in buildLastLocal + 1..65536) buildOffsets[l] = buildSize
        ensureChunk(buildChunk)
        chunks[buildChunk] = Chunk(buildOffsets, buildData.copyOf(buildSize))
        buildChunk = -1
        // the chunk owns the offsets now; the data buffer (up to twice the chunk's data) is garbage
        buildOffsets = IntArray(0)
        buildData = IntArray(0)
    }

    private fun write(data: IntArray, at: Int, start: Int, end: Int) {
        if (wide) {
            data[at] = start
            data[at + 1] = end
        } else {
            data[at] = (start shl 16) or end
        }
    }

    private fun startAt(data: IntArray, at: Int) = if (wide) data[at] else data[at] ushr 16

    private fun endAt(data: IntArray, at: Int) = if (wide) data[at + 1] else data[at] and 0xffff

    /**
     * New chunks for the chunks touched by [removed] ids and [added] runs (flattened, id-sorted or not,
     * (id, start, end) triples): the old runs minus those of [removed] ids, plus [added]. Read-only.
     */
    fun rebuild(removed: RoaringBitmap, added: IntArray): Map<Int, Chunk> {
        finishBuildChunk()
        val addedByChunk = HashMap<Int, MutableList<Long>>()
        for (t in 0 until added.size / 3) {
            val id = added[3 * t]
            val key =
                ((id and 0xffff).toLong() shl 40) or (added[3 * t + 1].toLong() shl 20) or added[3 * t + 2].toLong()
            addedByChunk.getOrPut(id ushr 16) { ArrayList() }.add(key)
        }
        val removedByChunk = HashMap<Int, MutableList<Int>>()
        forEachId(removed) { removedByChunk.getOrPut(it ushr 16) { ArrayList() }.add(it and 0xffff) }
        val touched = HashSet<Int>(addedByChunk.keys).also { it.addAll(removedByChunk.keys) }
        val result = HashMap<Int, Chunk>()
        for (chunk in touched) {
            result[chunk] = rebuildChunk(
                chunks.getOrNull(chunk),
                removedByChunk[chunk]?.toIntArray() ?: IntArray(0),
                addedByChunk[chunk]?.sorted() ?: emptyList(),
            )
        }
        return result
    }

    /**
     * [old] without the runs of the (ascending) [removedLocals], plus [extra] (sorted packed (local, start, end)).
     * Untouched stretches of local ids are copied with arraycopy.
     */
    private fun rebuildChunk(old: Chunk?, removedLocals: IntArray, extra: List<Long>): Chunk {
        val oldOffsets = old?.offsets ?: IntArray(65537)
        val oldData = old?.data ?: IntArray(0)
        val affected = java.util.TreeSet<Int>()
        removedLocals.forEach { affected.add(it) }
        extra.forEach { affected.add((it ushr 40).toInt()) }
        val removedSet = removedLocals.toHashSet()
        val offsets = IntArray(65537)
        val data = IntArray(oldData.size + extra.size * width)
        var size = 0
        var from = 0 // first local not yet copied
        var e = 0

        fun copyUntouched(until: Int) {
            if (until <= from) return
            val start = oldOffsets[from]
            val length = oldOffsets[until] - start
            System.arraycopy(oldData, start, data, size, length)
            val shift = size - start
            for (l in from until until) offsets[l] = oldOffsets[l] + shift
            size += length
        }
        for (local in affected) {
            copyUntouched(local)
            offsets[local] = size
            if (local !in removedSet) {
                val start = oldOffsets[local]
                val length = oldOffsets[local + 1] - start
                System.arraycopy(oldData, start, data, size, length)
                size += length
            }
            while (e < extra.size && (extra[e] ushr 40).toInt() == local) {
                write(data, size, ((extra[e] ushr 20) and 0xfffff).toInt(), (extra[e] and 0xfffff).toInt())
                size += width
                e++
            }
            from = local + 1
        }
        copyUntouched(65536)
        offsets[65536] = size
        return Chunk(offsets, if (size == data.size) data else data.copyOf(size))
    }

    /** under the write lock */
    fun install(rebuilt: Map<Int, Chunk>) {
        for ((chunk, c) in rebuilt) {
            ensureChunk(chunk)
            chunks[chunk] = c
        }
    }

    private fun usedChunks(): List<Int> = chunks.indices.filter { chunks[it] != null }

    /** missing counts per position (index = position) over [filter], or over all ids if [filter] is null */
    fun countsOver(filter: RoaringBitmap?): IntArray {
        val used = if (filter ==
            null
        ) {
            usedChunks()
        } else {
            chunkRanges(filter).map { it[0] ushr 16 }.filter { chunks.getOrNull(it) != null }
        }
        val diffs = parallel(used) { chunk ->
            val diff = IntArray(length + 2)
            val c = chunks[chunk]!!
            val data = c.data
            if (filter == null) {
                var at = 0
                while (at < data.size) {
                    diff[startAt(data, at)]++
                    diff[endAt(data, at)]--
                    at += width
                }
            } else {
                val offsets = c.offsets
                forEachIdIn(filter, chunk shl 16, (chunk + 1) shl 16) { id ->
                    val local = id and 0xffff
                    var at = offsets[local]
                    val until = offsets[local + 1]
                    while (at < until) {
                        diff[startAt(data, at)]++
                        diff[endAt(data, at)]--
                        at += width
                    }
                }
            }
            diff
        }
        val counts = IntArray(length + 1)
        var running = 0
        for (p in 1..length) {
            for (d in diffs) running += d[p]
            counts[p] = running
        }
        return counts
    }

    /** ids with a run covering [position] */
    fun missingAt(position: Int): RoaringBitmap {
        val parts = parallel(usedChunks()) { chunk ->
            val writer = RoaringBitmapWriter.writer().get()
            val c = chunks[chunk]!!
            val offsets = c.offsets
            val data = c.data
            val base = chunk shl 16
            var local = 0
            var at = 0
            while (at < data.size) {
                while (offsets[local + 1] <= at) local++
                if (startAt(data, at) <= position && position < endAt(data, at)) writer.add(base or local)
                at += width
            }
            writer.get()
        }
        return concatChunks(parts)
    }

    private fun <T> parallel(chunks: List<Int>, task: (Int) -> T): List<T> {
        if (chunks.size <= 1) return chunks.map(task)
        return indexPool.submit<List<T>> { chunks.parallelStream().map(task).toList() }.get()
    }
}
