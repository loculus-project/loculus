package org.loculus.backend.query.index

import org.loculus.backend.query.schema.SequenceSchema
import org.roaringbitmap.RoaringBitmap

/**
 * Index of one aligned sequence (segment or gene).
 *
 * - [present]: ids that have this sequence.
 * - mutation bitmaps `mutations[position][symbol]`: ids having [symbol] (neither reference nor missing) at
 *   [position].
 * - missing-symbol runs as "transition" bitmaps: `runStarts[q]` = ids with a missing run starting at q,
 *   `runEnds[q]` = ids with a run ending (exclusive) at q, plus checkpoint bitmaps
 *   `checkpoints[k]` = ids with the missing symbol at position k * [CHECKPOINT_SPACING] (exact).
 *   Runs of one entry are disjoint, so the missing set at p is
 *   `checkpoints[p / S] XOR runStarts[q] XOR runEnds[q]` for all q in (p / S * S, p], and the missing count
 *   over a set P is `|P ∩ checkpoint| + Σ (|P ∩ runStarts[q]| - |P ∩ runEnds[q]|)`.
 *   Point queries therefore touch at most 2 * S small bitmaps; per-position counts over a filter are a sweep.
 * - insertions: position -> inserted symbols -> ids.
 */
internal class SequenceIndex(val schema: SequenceSchema) {
    val length = schema.length
    val alphabet = schema.alphabet
    var present = RoaringBitmap()
        private set
    val mutations: Array<Array<RoaringBitmap?>?> = arrayOfNulls(length + 1)
    val runStarts: Array<RoaringBitmap?> = arrayOfNulls(length + 2)
    val runEnds: Array<RoaringBitmap?> = arrayOfNulls(length + 2)
    val checkpoints: Array<RoaringBitmap> = Array((length shr CHECKPOINT_SHIFT) + 1) { RoaringBitmap() }
    val insertions = HashMap<Int, HashMap<String, RoaringBitmap>>()

    /** exact cardinalities, maintained on every write: mutations at position * alphabet.size + symbol */
    val mutationCounts = IntArray((length + 1) * alphabet.size)
    private val startCounts = IntArray(length + 2)
    private val endCounts = IntArray(length + 2)

    /** cached missing counts per position over all [present] ids; invalidated on every write */
    @Volatile private var missingCountsAll: IntArray? = null

    fun invalidateCaches() {
        missingCountsAll = null
    }

    fun reference(position: Int): Int = schema.referenceSymbolIndex(position)

    // ---------------- writes ----------------

    fun addMutation(id: Int, position: Int, symbol: Int) {
        if (position < 1 || position > length || symbol >= alphabet.size) return
        val perSymbol = mutations[position] ?: arrayOfNulls<RoaringBitmap>(alphabet.size).also {
            mutations[position] = it
        }
        val bm = perSymbol[symbol] ?: RoaringBitmap().also { perSymbol[symbol] = it }
        if (bm.checkedAdd(id)) mutationCounts[position * alphabet.size + symbol]++
    }

    /** [start] inclusive, [end] exclusive, 1-based; runs of one entry must be disjoint (see [normalizeRuns]) */
    fun addMissingRun(id: Int, start: Int, end: Int) {
        val s = maxOf(1, start)
        val e = minOf(length + 1, end)
        if (s >= e) return
        if ((runStarts[s] ?: RoaringBitmap().also { runStarts[s] = it }).checkedAdd(id)) startCounts[s]++
        // ends beyond the last position never influence a position, so they are not stored
        if (e <= length && (runEnds[e] ?: RoaringBitmap().also { runEnds[e] = it }).checkedAdd(id)) endCounts[e]++
        var k = (s + CHECKPOINT_SPACING - 1) shr CHECKPOINT_SHIFT
        while (k < checkpoints.size && (k shl CHECKPOINT_SHIFT) < e) {
            if (k > 0) checkpoints[k].add(id)
            k++
        }
    }

    fun addInsertion(id: Int, position: Int, symbols: String) {
        insertions.getOrPut(position) { HashMap() }.getOrPut(symbols) { RoaringBitmap() }.add(id)
    }

    /**
     * A bitmap to remove ids from, and the cardinality counter (counts[index]) to adjust. [ids]: exactly the ids
     * contained in the bitmap (small batches), or null to remove the whole batch with andNot.
     */
    class Removal(val bitmap: RoaringBitmap, val counts: IntArray?, val index: Int, val ids: IntArray?)

    /**
     * Every bitmap containing any of [ids] (to remove them). Read-only, so it runs outside the write lock
     * concurrently with readers; parallel over position chunks. Tiny batches probe each id with contains()
     * (binary searches), which is much cheaper than a merge-based intersects() on large array containers;
     * small batches record the contained ids so that the write-locked phase only does point removals.
     */
    fun collectIntersecting(ids: RoaringBitmap, pool: java.util.concurrent.ForkJoinPool, out: MutableList<Removal>) {
        if (!RoaringBitmap.intersects(present, ids)) return
        val probe = if (ids.cardinality <= PROBE_LIMIT) ids.toArray() else null
        val probeOnly = ids.cardinality <= PROBE_ONLY_LIMIT

        fun check(bm: RoaringBitmap, counts: IntArray?, index: Int): Removal? {
            if (probe == null) return if (RoaringBitmap.intersects(bm, ids)) Removal(bm, counts, index, null) else null
            if (!probeOnly && !RoaringBitmap.intersects(bm, ids)) return null
            var matched: IntArray? = null
            var n = 0
            for (id in probe) {
                if (bm.contains(id)) {
                    if (matched == null) matched = IntArray(probe.size)
                    matched[n++] = id
                }
            }
            return matched?.let { Removal(bm, counts, index, it.copyOf(n)) }
        }

        check(present, null, 0)?.let { out.add(it) }
        val size = alphabet.size
        val chunks = (length + 1 + COLLECT_CHUNK - 1) / COLLECT_CHUNK
        val parts = pool.submit<List<List<Removal>>> {
            (0 until chunks).toList().parallelStream().map { chunk ->
                val part = ArrayList<Removal>()
                for (p in chunk * COLLECT_CHUNK until minOf(length + 2, (chunk + 1) * COLLECT_CHUNK)) {
                    if (p <= length) {
                        mutations[p]?.forEachIndexed { sym, bm ->
                            if (bm != null) check(bm, mutationCounts, p * size + sym)?.let { part.add(it) }
                        }
                    }
                    runStarts[p]?.let { bm -> check(bm, startCounts, p)?.let { part.add(it) } }
                    runEnds[p]?.let { bm -> check(bm, endCounts, p)?.let { part.add(it) } }
                }
                part
            }.toList()
        }.get()
        parts.forEach { out.addAll(it) }
        for (bm in checkpoints) check(bm, null, 0)?.let { out.add(it) }
        for (bySymbols in insertions.values) for (bm in bySymbols.values) check(bm, null, 0)?.let { out.add(it) }
    }

    /** under the write lock */
    fun remove(ids: RoaringBitmap, removals: List<Removal>) {
        for (r in removals) {
            val exact = r.ids
            if (exact != null) {
                for (id in exact) if (r.bitmap.checkedRemove(id)) r.counts?.let { it[r.index]-- }
            } else {
                if (r.counts != null) r.counts[r.index] -= RoaringBitmap.andCardinality(r.bitmap, ids)
                r.bitmap.andNot(ids)
            }
        }
    }

    /** compresses all bitmaps (bulk load only: replaces bitmap objects, so the index must not be visible yet) */
    fun runOptimize() {
        present = runOptimizeFewRuns(present)
        for (perSymbol in mutations) {
            if (perSymbol == null) continue
            for (s in perSymbol.indices) perSymbol[s]?.let { perSymbol[s] = runOptimizeFewRuns(it) }
        }
        for (q in runStarts.indices) runStarts[q]?.let { runStarts[q] = runOptimizeFewRuns(it) }
        for (q in runEnds.indices) runEnds[q]?.let { runEnds[q] = runOptimizeFewRuns(it) }
        for (k in checkpoints.indices) checkpoints[k] = runOptimizeFewRuns(checkpoints[k])
        insertions.values.forEach { m -> m.entries.forEach { it.setValue(runOptimizeFewRuns(it.value)) } }
    }

    fun memoryBytes(): Long {
        var total = present.getLongSizeInBytes()
        var slots = 0L
        for (perSymbol in mutations) {
            if (perSymbol == null) continue
            slots += perSymbol.size
            for (bm in perSymbol) if (bm != null) total += bm.getLongSizeInBytes() + 16
        }
        for (bm in runStarts) if (bm != null) total += bm.getLongSizeInBytes() + 16
        for (bm in runEnds) if (bm != null) total += bm.getLongSizeInBytes() + 16
        for (bm in checkpoints) total += bm.getLongSizeInBytes() + 16
        insertions.values.forEach { m -> m.values.forEach { total += it.getLongSizeInBytes() + 64 } }
        return total + slots * 4 + (mutations.size + runStarts.size + runEnds.size) * 4L +
            (mutationCounts.size + startCounts.size + endCounts.size) * 4L
    }

    // ---------------- reads ----------------

    /** ids having the missing symbol at [position] (fresh bitmap) */
    fun missingAt(position: Int): RoaringBitmap {
        val k = position shr CHECKPOINT_SHIFT
        val result = checkpoints[k].clone()
        for (q in (k shl CHECKPOINT_SHIFT) + 1..position) {
            runStarts[q]?.let { result.xor(it) }
            runEnds[q]?.let { result.xor(it) }
        }
        return result
    }

    /** missing counts per position (index = position) over all present ids */
    fun missingCountsAll(): IntArray {
        missingCountsAll?.let { return it }
        val counts = IntArray(length + 1)
        var running = 0
        for (p in 1..length) {
            running += startCounts[p] - endCounts[p]
            counts[p] = running
        }
        missingCountsAll = counts
        return counts
    }

    /** symbols (mask over alphabet indices) at [position] matching SILO's SymbolInSet over live ids */
    fun symbolInSet(position: Int, mask: Int): RoaringBitmap {
        if (position < 1 || position > length) return RoaringBitmap()
        val ref = reference(position)
        val missing = alphabet.missingIndex
        val includesRef = mask and (1 shl ref) != 0
        val includesMissing = mask and (1 shl missing) != 0
        val perSymbol = mutations[position]
        val inSet = ArrayList<RoaringBitmap>()
        val notInSet = ArrayList<RoaringBitmap>()
        if (perSymbol != null) {
            for (s in perSymbol.indices) {
                val bm = perSymbol[s] ?: continue
                if (s == ref || s == missing) continue
                if (mask and (1 shl s) != 0) inSet.add(bm) else notInSet.add(bm)
            }
        }
        return when {
            includesRef && includesMissing -> present.clone().also { r -> notInSet.forEach { r.andNot(it) } }

            includesMissing -> missingAt(position).also { r -> inSet.forEach { r.or(it) } }

            includesRef -> present.clone().also { r ->
                r.andNot(missingAt(position))
                notInSet.forEach { r.andNot(it) }
            }

            else -> unionOf(inSet)
        }
    }

    fun insertionMatching(position: Int, pattern: com.google.re2j.Pattern): RoaringBitmap {
        val bySymbols = insertions[position] ?: return RoaringBitmap()
        val parts = bySymbols.entries.filter { pattern.matcher(it.key).matches() }.map { it.value }
        return unionOf(parts)
    }

    companion object {
        const val CHECKPOINT_SHIFT = 7
        const val CHECKPOINT_SPACING = 1 shl CHECKPOINT_SHIFT
        private const val COLLECT_CHUNK = 1024
        private const val PROBE_LIMIT = 256
        private const val PROBE_ONLY_LIMIT = 16

        /**
         * sorts and merges overlapping / adjacent runs (flattened start, end pairs) so that runs are disjoint
         * and maximal, as the transition encoding requires.
         */
        fun normalizeRuns(runs: IntArray, count: Int): Int {
            if (count <= 1) return count
            var sorted = true
            for (i in 1 until count) if (runs[2 * i] < runs[2 * i - 1]) sorted = false
            if (sorted) return count
            val pairs = (0 until count).map { runs[2 * it] to runs[2 * it + 1] }.sortedBy { it.first }
            var n = 0
            for ((s, e) in pairs) {
                if (n > 0 && s <= runs[2 * n - 1]) {
                    runs[2 * n - 1] = maxOf(runs[2 * n - 1], e)
                } else {
                    runs[2 * n] = s
                    runs[2 * n + 1] = e
                    n++
                }
            }
            return n
        }
    }
}
