package org.loculus.backend.query.index

import org.roaringbitmap.RoaringBitmap
import org.roaringbitmap.RoaringBitmapWriter

/**
 * Missing-symbol runs of one sequence, per 65536-id chunk, in CSR layout, one Int per run
 * `(start << 16) | endExclusive` in `data` for sequences shorter than 65535 (else two Ints per run).
 *
 * Each [Chunk] indexes its runs by local id (`id and 0xffff`) in one of two ways, whichever is smaller:
 * - dense: `offsets[local]..offsets[local + 1]`, with `offsets` sized to the highest local id that has runs
 *   (4 B per id in that range), for chunks where most ids have runs (nucleotide segments);
 * - sparse: the ascending local ids that have runs in `locals`, and `offsets[i]..offsets[i + 1]` for
 *   `locals[i]` (8 B per id with runs), for chunks where few ids have runs (most genes).
 *
 * Counting missing symbols per position over a filter reads only the runs of the filtered ids (parallel per
 * chunk); point queries ("which ids are missing at p") scan the compact data of all chunks in parallel.
 * Writes: appends in ascending id order during the bulk load; incremental updates rebuild the affected chunks
 * outside the write lock ([rebuild]) and swap them in ([install]).
 */
internal class RunTable(private val length: Int) {
    private val wide = length + 1 >= 0xffff
    private val width = if (wide) 2 else 1

    /** one chunk; [locals] is null for the dense layout (see the class comment) */
    class Chunk(val locals: IntArray?, val offsets: IntArray, val data: IntArray) {
        /** number of Ints in [data] */
        val size: Int get() = offsets[offsets.size - 1]

        fun memoryBytes(): Long = arrayBytes(4L * offsets.size) + arrayBytes(4L * data.size) +
            (locals?.let { arrayBytes(4L * it.size) } ?: 0L)

        /** [action](local, from, until) for every local id with runs, in ascending order */
        inline fun forEachEntry(action: (Int, Int, Int) -> Unit) {
            val l = locals
            if (l == null) {
                for (local in 0 until offsets.size - 1) {
                    if (offsets[local] < offsets[local + 1]) action(local, offsets[local], offsets[local + 1])
                }
            } else {
                for (i in l.indices) action(l[i], offsets[i], offsets[i + 1])
            }
        }

        companion object {
            /**
             * the smaller layout for [count] ids with runs: ascending [entryLocals], their data ranges
             * `entryOffsets[i]..entryOffsets[i + 1]`, and [data] (exactly `entryOffsets[count]` Ints)
             */
            fun of(entryLocals: IntArray, entryOffsets: IntArray, count: Int, data: IntArray): Chunk {
                val range = if (count == 0) 0 else entryLocals[count - 1] + 1
                if (range + 1 <= 2 * count + 1) {
                    val offsets = IntArray(range + 1)
                    var i = 0
                    for (local in 0 until range) {
                        offsets[local] =
                            if (i < count && entryLocals[i] == local) entryOffsets[i++] else entryOffsets[i]
                    }
                    offsets[range] = entryOffsets[count]
                    return Chunk(null, offsets, data)
                }
                return Chunk(entryLocals.copyOf(count), entryOffsets.copyOf(count + 1), data)
            }
        }
    }

    private var chunks: Array<Chunk?> = arrayOfNulls(16)

    // bulk load state of the chunk being appended to: ids with runs and the start of their runs in buildData
    private var buildChunk = -1
    private var buildLocals = IntArray(0)
    private var buildOffsets = IntArray(0)
    private var buildCount = 0
    private var buildData = IntArray(0)
    private var buildSize = 0

    val runCount: Long get() = chunks.sumOf { (it?.size ?: 0).toLong() } / width

    fun memoryBytes(): Long = chunks.sumOf { it?.memoryBytes() ?: 0L } + buildBufferBytes()

    /** bulk-load buffers still held (0 once the load is complete) */
    internal fun buildBufferBytes(): Long = (buildLocals.size + buildOffsets.size + buildData.size) * 4L

    private fun ensureChunk(chunk: Int) {
        if (chunk >= chunks.size) chunks = chunks.copyOf(maxOf(chunk + 1, chunks.size * 2))
    }

    /** bulk load: all runs of an id, ids in ascending order ([start], [end] clamped to the sequence) */
    fun append(id: Int, start: Int, end: Int) {
        val chunk = id ushr 16
        val local = id and 0xffff
        val last = if (buildCount > 0) buildLocals[buildCount - 1] else -1
        val outOfOrder = if (chunk == buildChunk) local < last else chunks.getOrNull(chunk) != null
        if (outOfOrder) {
            // not ascending (only in tests / duplicate rows): rebuild the chunk
            install(rebuild(RoaringBitmap(), intArrayOf(id, start, end)))
            return
        }
        if (chunk != buildChunk) {
            finishBuildChunk()
            buildChunk = chunk
            buildLocals = IntArray(1024)
            buildOffsets = IntArray(1025)
            buildCount = 0
            buildData = IntArray(4096)
            buildSize = 0
        }
        if (buildCount == 0 || buildLocals[buildCount - 1] != local) {
            if (buildCount == buildLocals.size) {
                buildLocals = buildLocals.copyOf(buildCount * 2)
                buildOffsets = buildOffsets.copyOf(buildCount * 2 + 1)
            }
            buildLocals[buildCount] = local
            buildOffsets[buildCount] = buildSize
            buildCount++
        }
        if (buildSize + width > buildData.size) buildData = buildData.copyOf(buildData.size * 2)
        write(buildData, buildSize, start, end)
        buildSize += width
    }

    /** completes the bulk load */
    fun trim() = finishBuildChunk()

    private fun finishBuildChunk() {
        if (buildChunk < 0) return
        buildOffsets[buildCount] = buildSize
        ensureChunk(buildChunk)
        chunks[buildChunk] = Chunk.of(buildLocals, buildOffsets, buildCount, buildData.copyOf(buildSize))
        buildChunk = -1
        buildLocals = IntArray(0)
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
        val removedByChunk = HashMap<Int, RoaringBitmap>()
        forEachId(removed) { removedByChunk.getOrPut(it ushr 16) { RoaringBitmap() }.add(it and 0xffff) }
        val touched = HashSet<Int>(addedByChunk.keys).also { it.addAll(removedByChunk.keys) }
        val result = HashMap<Int, Chunk>()
        for (chunk in touched) {
            result[chunk] = rebuildChunk(
                chunks.getOrNull(chunk),
                removedByChunk[chunk] ?: RoaringBitmap(),
                addedByChunk[chunk]?.sorted() ?: emptyList(),
            )
        }
        return result
    }

    /** [old] without the runs of the [removedLocals], plus [extra] (sorted packed (local, start, end)) */
    private fun rebuildChunk(old: Chunk?, removedLocals: RoaringBitmap, extra: List<Long>): Chunk {
        val oldData = old?.data ?: IntArray(0)
        val oldEntries = old?.let { if (it.locals == null) it.offsets.size - 1 else it.locals.size } ?: 0
        val capacity = oldEntries + extra.size + 1
        val locals = IntArray(capacity)
        val offsets = IntArray(capacity + 1)
        val data = IntArray(oldData.size + extra.size * width)
        var count = 0
        var size = 0
        var e = 0

        fun addExtraUpTo(limit: Int) {
            // extra runs of locals below [limit] (the old chunk has no runs for them, or they were removed)
            while (e < extra.size && (extra[e] ushr 40).toInt() < limit) {
                val local = (extra[e] ushr 40).toInt()
                locals[count] = local
                offsets[count++] = size
                while (e < extra.size && (extra[e] ushr 40).toInt() == local) {
                    write(data, size, ((extra[e] ushr 20) and 0xfffff).toInt(), (extra[e] and 0xfffff).toInt())
                    size += width
                    e++
                }
            }
        }
        old?.forEachEntry { local, from, until ->
            addExtraUpTo(local)
            val keep = !removedLocals.contains(local)
            val hasExtra = e < extra.size && (extra[e] ushr 40).toInt() == local
            if (keep || hasExtra) {
                locals[count] = local
                offsets[count++] = size
                if (keep) {
                    System.arraycopy(oldData, from, data, size, until - from)
                    size += until - from
                }
                while (e < extra.size && (extra[e] ushr 40).toInt() == local) {
                    write(data, size, ((extra[e] ushr 20) and 0xfffff).toInt(), (extra[e] and 0xfffff).toInt())
                    size += width
                    e++
                }
            }
        }
        addExtraUpTo(Int.MAX_VALUE)
        offsets[count] = size
        return Chunk.of(locals, offsets, count, if (size == data.size) data else data.copyOf(size))
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
        val used = if (filter == null) {
            usedChunks()
        } else {
            chunkRanges(filter).map { it[0] ushr 16 }.filter { chunks.getOrNull(it) != null }
        }
        val diffs = parallel(used) { chunk ->
            val diff = IntArray(length + 2)
            val c = chunks[chunk]!!
            val data = c.data

            fun addRuns(from: Int, until: Int) {
                var at = from
                while (at < until) {
                    diff[startAt(data, at)]++
                    diff[endAt(data, at)]--
                    at += width
                }
            }
            if (filter == null) {
                addRuns(0, c.size)
            } else {
                val offsets = c.offsets
                val locals = c.locals
                if (locals == null) {
                    val range = offsets.size - 1
                    forEachIdIn(filter, chunk shl 16, (chunk + 1) shl 16) { id ->
                        val local = id and 0xffff
                        if (local < range) addRuns(offsets[local], offsets[local + 1])
                    }
                } else {
                    // merge the (ascending) filter ids with the (ascending) ids that have runs
                    var i = 0
                    forEachIdIn(filter, chunk shl 16, (chunk + 1) shl 16) { id ->
                        val local = id and 0xffff
                        while (i < locals.size && locals[i] < local) i++
                        if (i < locals.size && locals[i] == local) addRuns(offsets[i], offsets[i + 1])
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
            val data = c.data
            val base = chunk shl 16
            c.forEachEntry { local, from, until ->
                var at = from
                while (at < until) {
                    if (startAt(data, at) <= position && position < endAt(data, at)) {
                        writer.add(base or local)
                        break
                    }
                    at += width
                }
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
