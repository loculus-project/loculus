package org.loculus.backend.query.index

import org.loculus.backend.query.projection.IntList
import org.roaringbitmap.FastAggregation
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

/**
 * One id set per position (index 0 until size): a sorted IntArray (16 + 4 B per id) up to [SMALL_SET] ids, a
 * RoaringBitmap (~110 B of objects before its first id) above. Written under the index write lock only.
 */
internal class IdSlots(size: Int) {
    private val slots = arrayOfNulls<Any>(size)

    /** adds [id]; false if it was there */
    fun add(position: Int, id: Int): Boolean {
        when (val slot = slots[position]) {
            null -> slots[position] = intArrayOf(id)

            is IntArray -> {
                val at = java.util.Arrays.binarySearch(slot, id)
                if (at >= 0) return false
                val insert = -at - 1
                if (slot.size < SMALL_SET) {
                    val grown = IntArray(slot.size + 1)
                    System.arraycopy(slot, 0, grown, 0, insert)
                    grown[insert] = id
                    System.arraycopy(slot, insert, grown, insert + 1, slot.size - insert)
                    slots[position] = grown
                } else {
                    slots[position] = RoaringBitmap.bitmapOf(*slot).also { it.add(id) }
                }
            }

            else -> return (slot as RoaringBitmap).checkedAdd(id)
        }
        return true
    }

    /** removes those of [ids] present; returns how many */
    fun remove(position: Int, ids: IntArray): Int {
        when (val slot = slots[position]) {
            null -> return 0

            is IntArray -> {
                val kept = slot.filter { java.util.Arrays.binarySearch(ids, it) < 0 }
                slots[position] = if (kept.isEmpty()) null else kept.toIntArray()
                return slot.size - kept.size
            }

            else -> {
                var n = 0
                for (id in ids) if ((slot as RoaringBitmap).checkedRemove(id)) n++
                return n
            }
        }
    }

    /** the ids of the set at [position] that are in [ids] (ascending), or null if none */
    fun intersecting(position: Int, ids: RoaringBitmap): IntArray? {
        val found = when (val slot = slots[position]) {
            null -> return null

            is IntArray -> slot.filter { ids.contains(it) }.toIntArray()

            else -> if (RoaringBitmap.intersects(
                    slot as RoaringBitmap,
                    ids,
                )
            ) {
                RoaringBitmap.and(slot, ids).toArray()
            } else {
                null
            }
        }
        return found?.takeIf { it.isNotEmpty() }
    }

    /** adds the set at [position] to [bitmaps] if it is a bitmap, else its ids to [single] */
    fun collect(position: Int, bitmaps: MutableList<RoaringBitmap>, single: IntList) {
        when (val slot = slots[position]) {
            null -> {}
            is IntArray -> for (id in slot) single.add(id)
            else -> bitmaps.add(slot as RoaringBitmap)
        }
    }

    /** the sets stored as bitmaps (for tests) */
    fun bitmaps(): List<RoaringBitmap> = slots.filterIsInstance<RoaringBitmap>()

    fun cardinality(position: Int): Int = when (val slot = slots[position]) {
        null -> 0
        is IntArray -> slot.size
        else -> (slot as RoaringBitmap).cardinality
    }

    /** the compact form of the set at [position] (array or trimmed bitmap), or null if it has no ids */
    fun compacted(position: Int): Any? = when (val slot = slots[position]) {
        null, is IntArray -> slot

        else -> {
            val bm = slot as RoaringBitmap
            when {
                bm.isEmpty -> null
                bm.cardinality <= SMALL_SET -> bm.toArray()
                else -> runOptimizeFewRuns(bm.clone())
            }
        }
    }

    /** under the write lock (swaps in a [compacted] form) */
    fun set(position: Int, value: Any?) {
        slots[position] = value
    }

    /** compacts every set (bulk load only, before the index is visible) */
    fun compactAll() {
        for (p in slots.indices) if (slots[p] is RoaringBitmap) slots[p] = compacted(p)
    }

    fun memoryBytes(): Long {
        var total = arrayBytes(4L * slots.size)
        for (slot in slots) {
            total += when (slot) {
                null -> 0L
                is IntArray -> arrayBytes(4L * slot.size)
                else -> heapBytes(slot as RoaringBitmap)
            }
        }
        return total
    }

    companion object {
        /** up to this many ids a sorted array is smaller than a bitmap (16 + 4k B against ~110 + 2k B) */
        const val SMALL_SET = 32
    }
}

/**
 * Runs of one symbol per id: the missing symbol, or gaps (`-`) where they are sparse (see
 * [SequenceIndex.storeSparseGapsAsRuns]). The runs of one id are disjoint. Stored twice:
 * - for point queries ("which ids have the symbol at p", [at]): "transition" sets [starts] / [ends] (ids with
 *   a run starting / ending exclusive at q; [IdSlots], mostly a few ids each) and exact checkpoints
 *   [checkpoints] (ids covered at position k * [CHECKPOINT_SPACING]). The set at p is the nearer checkpoint XOR
 *   the transitions in between (at most [CHECKPOINT_SPACING] / 2 positions of small sets).
 * - for per-position counts over a filter: a [RunTable] ([table]), which reads only the runs of the filtered ids.
 *
 * Written by the index writer only; [compactTouched] re-compresses what writes changed.
 */
internal class RunIndex(private val length: Int) {
    val table = RunTable(length)
    val starts = IdSlots(length + 2)
    val ends = IdSlots(length + 2)
    val checkpoints: Array<RoaringBitmap> = Array((length shr CHECKPOINT_SHIFT) + 1) { RoaringBitmap() }

    /** cardinalities of [starts] / [ends], maintained on every write */
    val startCounts = IntArray(length + 2)
    val endCounts = IntArray(length + 2)

    /** positions of transition sets and checkpoint indexes changed since the last [compactTouched] */
    val touchedPositions = java.util.BitSet()
    val touchedCheckpoints = java.util.BitSet()

    /** counts per position over all ids (cached until the next write) */
    @Volatile private var countsAll: IntArray? = null

    fun invalidateCaches() {
        countsAll = null
    }

    /** bulk load: a run ([start] inclusive, [end] exclusive, 1-based) into both structures, ids ascending */
    fun add(id: Int, start: Int, end: Int) {
        val s = maxOf(1, start)
        val e = minOf(length + 1, end)
        if (s >= e) return
        addTransitions(id, s, e)
        table.append(id, s, e)
    }

    /** a run into the point-query structures only (the run table is updated via [RunTable.rebuild]) */
    fun addTransitions(id: Int, start: Int, end: Int) {
        val s = maxOf(1, start)
        val e = minOf(length + 1, end)
        if (s >= e) return
        if (starts.add(s, id)) startCounts[s]++
        touchedPositions.set(s)
        // ends beyond the last position never influence a position, so they are not stored
        if (e <= length && ends.add(e, id)) endCounts[e]++
        touchedPositions.set(e)
        var k = (s + CHECKPOINT_SPACING - 1) shr CHECKPOINT_SHIFT
        while (k < checkpoints.size && (k shl CHECKPOINT_SHIFT) < e) {
            if (k > 0) {
                checkpoints[k].add(id)
                touchedCheckpoints.set(k)
            }
            k++
        }
    }

    /** removes those of [ids] (ascending) from the transition set at [position] (under the write lock) */
    fun removeTransitions(start: Boolean, position: Int, ids: IntArray) {
        if (start) {
            startCounts[position] -= starts.remove(position, ids)
        } else {
            endCounts[position] -=
                ends.remove(position, ids)
        }
        touchedPositions.set(position)
    }

    /**
     * ids with a run covering [position] (fresh bitmap): the nearer checkpoint XOR the transitions between it and
     * [position] (XOR is its own inverse, so sweeping backwards from the next checkpoint works too). Transition
     * bitmaps are combined first, then XORed once with the (large) checkpoint; ids of small transition sets are
     * flipped one by one.
     */
    fun at(position: Int): RoaringBitmap {
        val k = position shr CHECKPOINT_SHIFT
        val forward = position - (k shl CHECKPOINT_SHIFT)
        val next = k + 1
        val backward = if (next < checkpoints.size) (next shl CHECKPOINT_SHIFT) - position else Int.MAX_VALUE
        val transitions = ArrayList<RoaringBitmap>()
        val single = IntList()
        val base: RoaringBitmap
        val range = if (forward <= backward) {
            base = checkpoints[k]
            (k shl CHECKPOINT_SHIFT) + 1..position
        } else {
            base = checkpoints[next]
            position + 1..(next shl CHECKPOINT_SHIFT)
        }
        for (q in range) {
            starts.collect(q, transitions, single)
            ends.collect(q, transitions, single)
        }
        val result = when (transitions.size) {
            0 -> base.clone()
            1 -> RoaringBitmap.xor(base, transitions[0])
            else -> RoaringBitmap.xor(base, FastAggregation.xor(*transitions.toTypedArray()))
        }
        for (i in 0 until single.size) result.flip(single[i])
        return result
    }

    /** counts per position (index = position) over [ids] */
    fun countsOver(ids: RoaringBitmap): IntArray = table.countsOver(ids)

    /** counts per position (index = position) over all ids (cached until the next write) */
    fun countsAll(): IntArray {
        countsAll?.let { return it }
        val counts = IntArray(length + 1)
        var running = 0
        for (p in 1..length) {
            running += startCounts[p] - endCounts[p]
            counts[p] = running
        }
        countsAll = counts
        return counts
    }

    /** compresses all bitmaps and completes the run table (bulk load only, before the index is visible) */
    fun runOptimize() {
        table.trim()
        starts.compactAll()
        ends.compactAll()
        for (k in checkpoints.indices) checkpoints[k] = runOptimizeFewRuns(checkpoints[k])
        clearTouched()
    }

    fun clearTouched() {
        touchedPositions.clear()
        touchedCheckpoints.clear()
    }

    /** like [SequenceIndex.compactTouched]: optimised copies of the changed bitmaps as assignments into [swaps] */
    fun compactTouched(swaps: MutableList<() -> Unit>, flushIfFull: () -> Unit) {
        var p = touchedPositions.nextSetBit(0)
        while (p >= 0) {
            val position = p
            if (position < length + 2) {
                val s = starts.compacted(position)
                val e = ends.compacted(position)
                swaps.add {
                    starts.set(position, s)
                    ends.set(position, e)
                }
            }
            flushIfFull()
            p = touchedPositions.nextSetBit(p + 1)
        }
        var k = touchedCheckpoints.nextSetBit(0)
        while (k >= 0) {
            val index = k
            val o = runOptimizeFewRuns(checkpoints[index].clone())
            swaps.add { checkpoints[index] = o }
            flushIfFull()
            k = touchedCheckpoints.nextSetBit(k + 1)
        }
        clearTouched()
    }

    fun memoryBytes(): Long {
        var total = table.memoryBytes() + starts.memoryBytes() + ends.memoryBytes()
        for (bm in checkpoints) total += heapBytes(bm)
        return total + (startCounts.size + endCounts.size + checkpoints.size) * 4L
    }

    companion object {
        const val CHECKPOINT_SHIFT = 7
        const val CHECKPOINT_SPACING = 1 shl CHECKPOINT_SHIFT
    }
}
