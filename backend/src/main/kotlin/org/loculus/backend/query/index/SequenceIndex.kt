package org.loculus.backend.query.index

import org.loculus.backend.query.schema.MutationCode
import org.loculus.backend.query.schema.SequenceSchema
import org.roaringbitmap.FastAggregation
import org.roaringbitmap.RoaringBitmap

/**
 * Index of one aligned sequence (segment or gene).
 *
 * - [present]: ids that have this sequence.
 * - mutation bitmaps `mutations[position][symbol]`: ids having [symbol] at [position], for every symbol except
 *   the missing symbol and the position's implicit symbol [localReference] (see [adaptLocalReference]). Ids with
 *   the implicit symbol are those present, not missing and in none of the position's bitmaps. The implicit
 *   symbol starts as the reference; where most entries differ from the reference it becomes their symbol, and
 *   entries carrying the reference then get an explicit bitmap for it. Queries keep their meaning relative to
 *   the reference ([reference]); only the storage changes.
 * - missing-symbol runs, twice:
 *   - for point queries ("which ids are missing at p"): "transition" bitmaps `runStarts[q]` / `runEnds[q]`
 *     (ids with a run starting / ending exclusive at q) and exact checkpoints `checkpoints[k]` (ids missing at
 *     position k * [CHECKPOINT_SPACING]). Runs of one entry are disjoint, so the missing set at p is the nearer
 *     checkpoint XOR the transitions in between (at most S / 2 small bitmaps).
 *   - for per-position missing counts over a filter: a [RunTable] (CSR per 65536-id chunk), which reads only
 *     the runs of the filtered ids.
 * - insertions: position -> inserted symbols -> ids.
 */
internal class SequenceIndex(val schema: SequenceSchema) {
    val length = schema.length
    val alphabet = schema.alphabet
    var present = RoaringBitmap()
        private set
    val mutations: Array<Array<RoaringBitmap?>?> = arrayOfNulls(length + 1)
    val runs = RunTable(length)
    val runStarts: Array<RoaringBitmap?> = arrayOfNulls(length + 2)
    val runEnds: Array<RoaringBitmap?> = arrayOfNulls(length + 2)
    val checkpoints: Array<RoaringBitmap> = Array((length shr CHECKPOINT_SHIFT) + 1) { RoaringBitmap() }
    val insertions = HashMap<Int, HashMap<String, RoaringBitmap>>()

    /** implicit (unstored) symbol per position (index = position); the reference unless [adaptLocalReference] */
    private val localReference = ByteArray(length + 1).also { for (p in 1..length) it[p] = reference(p).toByte() }

    /** ascending positions whose implicit symbol is not the reference */
    var localReferencePositions = IntArray(0)
        private set

    /** exact cardinalities of the stored bitmaps, maintained on every write: at position * alphabet.size + symbol */
    val mutationCounts = IntArray((length + 1) * alphabet.size)
    private val startCounts = IntArray(length + 2)
    private val endCounts = IntArray(length + 2)

    /** cached missing counts per position over all [present] ids; invalidated on every write */
    @Volatile private var missingCountsAll: IntArray? = null

    fun invalidateCaches() {
        missingCountsAll = null
    }

    fun reference(position: Int): Int = schema.referenceSymbolIndex(position)

    /** the symbol that [position] stores implicitly (see [localReference]) */
    fun implicitSymbol(position: Int): Int = localReference[position].toInt()

    val hasLocalReference: Boolean get() = localReferencePositions.isNotEmpty()

    // ---------------- writes ----------------

    fun addMutation(id: Int, position: Int, symbol: Int) {
        if (position < 1 || position > length || symbol >= alphabet.size) return
        val perSymbol = mutations[position] ?: arrayOfNulls<RoaringBitmap>(alphabet.size).also {
            mutations[position] = it
        }
        val bm = perSymbol[symbol] ?: RoaringBitmap().also { perSymbol[symbol] = it }
        if (bm.checkedAdd(id)) mutationCounts[position * alphabet.size + symbol]++
    }

    /**
     * Adds the mutation codes of one entry (codes of this sequence only; symbols relative to the reference) when
     * some positions store another symbol than the reference implicitly: a code for the implicit symbol is not
     * stored, and the entry is added to the reference bitmap of every such position where it has no code and is
     * not missing. [runs]: the entry's normalised missing runs of this sequence (flattened start, end pairs).
     */
    fun addMutationsWithLocalReference(id: Int, codes: IntArray, runs: IntArray, runCount: Int, present: Boolean) {
        val positions = IntArray(codes.size)
        for ((i, code) in codes.withIndex()) {
            val position = MutationCode.position(code)
            positions[i] = position
            val symbol = MutationCode.symbolIndex(code)
            if (position in 1..length && symbol != implicitSymbol(position)) addMutation(id, position, symbol)
        }
        if (!present) return
        positions.sort()
        var run = 0
        for (position in localReferencePositions) {
            while (run < runCount && runs[2 * run + 1] <= position) run++
            if (run < runCount && runs[2 * run] <= position) continue
            if (java.util.Arrays.binarySearch(positions, position) >= 0) continue
            addMutation(id, position, reference(position))
        }
    }

    /**
     * Makes each position's most common non-missing valid symbol its implicit symbol where that is not the
     * reference (SILO's adaptLocalReference): the reference gets an explicit bitmap (present \ missing \ all
     * stored symbols) and the new implicit symbol's bitmap is dropped. Positions whose reference is the missing
     * symbol keep it. Bulk load only, before [runOptimize] (replaces bitmaps; the index must not be visible yet).
     * Later writes keep the choice; correctness never depends on the implicit symbol being the majority.
     */
    fun adaptLocalReference() {
        val missing = missingCountsAll()
        val presentCount = present.cardinality
        val size = alphabet.size
        val valid = alphabet.validMutationMask
        val changed = java.util.concurrent.ConcurrentLinkedQueue<Int>()
        (0..length step COLLECT_CHUNK).toList().parallelStream().forEach { from ->
            for (p in maxOf(1, from) until minOf(length + 1, from + COLLECT_CHUNK)) {
                val perSymbol = mutations[p] ?: continue
                val ref = reference(p)
                if (ref == alphabet.missingIndex || implicitSymbol(p) != ref) continue
                var stored = 0L
                var best = -1
                var bestCount = 0
                for (s in 0 until size) {
                    val c = mutationCounts[p * size + s]
                    stored += c
                    if (valid and (1 shl s) != 0 && c > bestCount) {
                        best = s
                        bestCount = c
                    }
                }
                val implicit = presentCount - missing[p] - stored
                if (best < 0 || bestCount <= implicit) continue
                val refIds = present.clone()
                refIds.andNot(missingAt(p))
                for (bm in perSymbol) if (bm != null) refIds.andNot(bm)
                perSymbol[best] = null
                mutationCounts[p * size + best] = 0
                perSymbol[ref] = if (refIds.isEmpty) null else refIds
                mutationCounts[p * size + ref] = refIds.cardinality
                localReference[p] = best.toByte()
                changed.add(p)
            }
        }
        localReferencePositions = changed.toIntArray().also { it.sort() }
        invalidateCaches()
    }

    /**
     * Entries a re-pick of the implicit symbols would stop storing: per position, how far the most common stored
     * valid symbol exceeds the implicit one (0 right after a full load; grows as updates shift the majority).
     */
    fun localReferenceExcess(): Long {
        val missing = missingCountsAll()
        val presentCount = present.cardinality.toLong()
        val size = alphabet.size
        val valid = alphabet.validMutationMask
        var excess = 0L
        for (p in 1..length) {
            if (mutations[p] == null || reference(p) == alphabet.missingIndex) continue
            var stored = 0L
            var best = 0
            for (s in 0 until size) {
                val c = mutationCounts[p * size + s]
                stored += c
                if (valid and (1 shl s) != 0 && c > best) best = c
            }
            excess += maxOf(0L, best - (presentCount - missing[p] - stored))
        }
        return excess
    }

    /**
     * bulk load: a missing run ([start] inclusive, [end] exclusive, 1-based) into both structures; runs of one
     * entry must be disjoint ([normalizeRuns]) and ids ascending
     */
    fun addMissingRun(id: Int, start: Int, end: Int) {
        val s = maxOf(1, start)
        val e = minOf(length + 1, end)
        if (s >= e) return
        addTransitions(id, s, e)
        runs.append(id, s, e)
    }

    /** a missing run into the point-query structures only (the run table is updated via [RunTable.rebuild]) */
    fun addTransitions(id: Int, start: Int, end: Int) {
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

    /** clamps flattened (id, start, end) triples to the sequence, dropping empty runs */
    fun clampRuns(triples: IntArray): IntArray {
        val out = IntArray(triples.size)
        var n = 0
        for (t in 0 until triples.size / 3) {
            val s = maxOf(1, triples[3 * t + 1])
            val e = minOf(length + 1, triples[3 * t + 2])
            if (s < e) {
                out[n++] = triples[3 * t]
                out[n++] = s
                out[n++] = e
            }
        }
        return out.copyOf(n)
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
        (0..length step 1024).toList().parallelStream().forEach { from ->
            for (p in from until minOf(length + 1, from + 1024)) {
                val perSymbol = mutations[p] ?: continue
                for (s in perSymbol.indices) perSymbol[s]?.let { perSymbol[s] = runOptimizeFewRuns(it) }
            }
        }
        runs.trim()
        for (q in runStarts.indices) runStarts[q]?.let { runStarts[q] = runOptimizeFewRuns(it) }
        for (q in runEnds.indices) runEnds[q]?.let { runEnds[q] = runOptimizeFewRuns(it) }
        for (k in checkpoints.indices) checkpoints[k] = runOptimizeFewRuns(checkpoints[k])
        insertions.values.forEach { m -> m.entries.forEach { it.setValue(runOptimizeFewRuns(it.value)) } }
    }

    fun memoryBytes(): Long {
        var total = heapBytes(present)
        for (perSymbol in mutations) {
            if (perSymbol == null) continue
            total += arrayBytes(4L * perSymbol.size)
            for (bm in perSymbol) if (bm != null) total += heapBytes(bm)
        }
        total += runs.memoryBytes()
        for (bm in runStarts) if (bm != null) total += heapBytes(bm)
        for (bm in runEnds) if (bm != null) total += heapBytes(bm)
        for (bm in checkpoints) total += heapBytes(bm)
        total += (runStarts.size + runEnds.size + startCounts.size + endCounts.size) * 4L
        insertions.values.forEach { m -> m.values.forEach { total += heapBytes(it) + 64 } }
        return total + mutations.size * 4L + mutationCounts.size * 4L + arrayBytes(localReference.size.toLong()) +
            arrayBytes(4L * localReferencePositions.size)
    }

    // ---------------- reads ----------------

    /**
     * ids having the missing symbol at [position] (fresh bitmap): the nearer checkpoint XOR the run transitions
     * between it and [position] (XOR is its own inverse, so sweeping backwards from the next checkpoint works too).
     * The (small) transition bitmaps are combined first, then XORed once with the (large) checkpoint.
     */
    fun missingAt(position: Int): RoaringBitmap {
        val k = position shr CHECKPOINT_SHIFT
        val forward = position - (k shl CHECKPOINT_SHIFT)
        val next = k + 1
        val backward = if (next < checkpoints.size) (next shl CHECKPOINT_SHIFT) - position else Int.MAX_VALUE
        val transitions = ArrayList<RoaringBitmap>()
        val base: RoaringBitmap
        if (forward <= backward) {
            base = checkpoints[k]
            for (q in (k shl CHECKPOINT_SHIFT) + 1..position) {
                runStarts[q]?.let { transitions.add(it) }
                runEnds[q]?.let { transitions.add(it) }
            }
        } else {
            base = checkpoints[next]
            for (q in position + 1..(next shl CHECKPOINT_SHIFT)) {
                runStarts[q]?.let { transitions.add(it) }
                runEnds[q]?.let { transitions.add(it) }
            }
        }
        if (transitions.isEmpty()) return base.clone()
        val combined = if (transitions.size == 1) transitions[0] else FastAggregation.xor(*transitions.toTypedArray())
        return RoaringBitmap.xor(base, combined)
    }

    /** missing counts per position (index = position) over [ids] */
    fun missingCountsOver(ids: RoaringBitmap): IntArray = runs.countsOver(ids)

    /** missing counts per position (index = position) over all present ids (cached until the next write) */
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
        // ids with the implicit symbol = present \ missing \ all stored bitmaps of the position
        val implicit = implicitSymbol(position)
        val missing = alphabet.missingIndex
        val includesImplicit = mask and (1 shl implicit) != 0
        val includesMissing = mask and (1 shl missing) != 0
        val perSymbol = mutations[position]
        val inSet = ArrayList<RoaringBitmap>()
        val notInSet = ArrayList<RoaringBitmap>()
        if (perSymbol != null) {
            for (s in perSymbol.indices) {
                val bm = perSymbol[s] ?: continue
                if (s == implicit || s == missing) continue
                if (mask and (1 shl s) != 0) inSet.add(bm) else notInSet.add(bm)
            }
        }
        return when {
            includesImplicit && includesMissing -> present.clone().also { r -> notInSet.forEach { r.andNot(it) } }

            includesMissing -> missingAt(position).also { r -> inSet.forEach { r.or(it) } }

            includesImplicit -> present.clone().also { r ->
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
        /** mutation counting works on blocks of 2^BLOCK_SHIFT positions (one parallel task each) */
        const val BLOCK_SHIFT = 7
        const val BLOCK_SIZE = 1 shl BLOCK_SHIFT
        const val CHECKPOINT_SHIFT = 7
        const val CHECKPOINT_SPACING = 1 shl CHECKPOINT_SHIFT
        private const val COLLECT_CHUNK = 1024
        private const val PROBE_LIMIT = 256
        private const val PROBE_ONLY_LIMIT = 16

        /**
         * sorts and merges overlapping / adjacent runs (flattened start, end pairs) so that runs are disjoint
         * and maximal.
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
