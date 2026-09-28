package org.loculus.backend.query.index

import org.loculus.backend.query.schema.MutationCode
import org.loculus.backend.query.schema.SequenceSchema
import org.roaringbitmap.RoaringBitmap

/**
 * Index of one aligned sequence (segment or gene).
 *
 * - [present]: ids that have this sequence.
 * - mutation bitmaps `mutations[position][symbol]`: ids having [symbol] at [position], for every symbol except
 *   the missing symbol, the position's implicit symbol [localReference] (see [adaptLocalReference]) and gaps
 *   where they are stored as runs. Ids with the implicit symbol are those present, not missing, not in a gap run
 *   and in none of the position's bitmaps. The implicit symbol starts as the reference; where most entries differ
 *   from the reference it becomes their symbol, and entries carrying the reference then get an explicit bitmap
 *   for it. Queries keep their meaning relative to the reference ([reference]); only the storage changes.
 * - [missing]: missing-symbol runs ([RunIndex]).
 * - [gaps]: gap (`-`) runs at the positions where gaps are sparse ([storeSparseGapsAsRuns]); a deletion then
 *   costs one run per entry instead of one bitmap entry per position.
 * - insertions: position -> inserted symbols -> ids.
 */
internal class SequenceIndex(val schema: SequenceSchema) {
    val length = schema.length
    val alphabet = schema.alphabet
    var present = RoaringBitmap()
        private set
    val mutations: Array<Array<RoaringBitmap?>?> = arrayOfNulls(length + 1)
    val missing = RunIndex(length)
    val gaps = RunIndex(length)
    val insertions = HashMap<Int, HashMap<String, RoaringBitmap>>()

    /** the gap symbol's index */
    val gapSymbol = alphabet.indexOf('-')

    /**
     * whether gaps at positions outside [denseGaps] are stored in [gaps] instead of bitmaps; decided at a full
     * load ([storeSparseGapsAsRuns]), until then (bulk load) every gap is a bitmap
     */
    var gapRuns = false
        private set

    /** positions whose gaps stay bitmaps once [gapRuns] is on (dense at the full load, or gap is implicit) */
    private val denseGaps = java.util.BitSet()

    /** implicit (unstored) symbol per position (index = position); the reference unless [adaptLocalReference] */
    private val localReference = ByteArray(length + 1).also { for (p in 1..length) it[p] = reference(p).toByte() }

    /** ascending positions whose implicit symbol is not the reference */
    var localReferencePositions = IntArray(0)
        private set

    /** exact cardinalities of the stored bitmaps, maintained on every write: at position * alphabet.size + symbol */
    val mutationCounts = IntArray((length + 1) * alphabet.size)

    /**
     * What writes after the bulk load changed, so that [compactTouched] re-compresses only those bitmaps:
     * positions of mutation bitmaps, insertion positions and [present] (the run indexes track their own).
     * Written and read by the index writer only.
     */
    private val touchedPositions = java.util.BitSet()
    private val touchedInsertions = HashSet<Int>()
    private var presentTouched = false

    fun invalidateCaches() {
        missing.invalidateCaches()
        gaps.invalidateCaches()
    }

    fun reference(position: Int): Int = schema.referenceSymbolIndex(position)

    /** the symbol that [position] stores implicitly (see [localReference]) */
    fun implicitSymbol(position: Int): Int = localReference[position].toInt()

    val hasLocalReference: Boolean get() = localReferencePositions.isNotEmpty()

    /** whether gaps at [position] are stored in [gaps] */
    fun gapAsRun(position: Int): Boolean = gapRuns && !denseGaps.get(position)

    // ---------------- writes ----------------

    fun addPresent(id: Int) {
        present.add(id)
        presentTouched = true
    }

    fun addMutation(id: Int, position: Int, symbol: Int) {
        if (position < 1 || position > length || symbol >= alphabet.size) return
        val perSymbol = mutations[position] ?: arrayOfNulls<RoaringBitmap>(alphabet.size).also {
            mutations[position] = it
        }
        val bm = perSymbol[symbol] ?: RoaringBitmap().also { perSymbol[symbol] = it }
        if (bm.checkedAdd(id)) mutationCounts[position * alphabet.size + symbol]++
        touchedPositions.set(position)
    }

    /**
     * The gap runs of one entry, flattened (start, end exclusive) pairs, ascending: its gap codes at positions
     * whose gaps are stored as runs ([gapAsRun]), merged where adjacent. [codes]: codes of this sequence, any
     * order, duplicates allowed.
     */
    fun gapRunsOf(codes: IntArray): IntArray {
        if (!gapRuns) return IntArray(0)
        var positions = IntArray(8)
        var n = 0
        for (code in codes) {
            if (MutationCode.symbolIndex(code) != gapSymbol) continue
            val position = MutationCode.position(code)
            if (position < 1 || position > length || !gapAsRun(position)) continue
            if (n == positions.size) positions = positions.copyOf(n * 2)
            positions[n++] = position
        }
        if (n == 0) return IntArray(0)
        java.util.Arrays.sort(positions, 0, n)
        val runs = IntArray(2 * n)
        var r = 0
        for (i in 0 until n) {
            val position = positions[i]
            if (r > 0 && position <= runs[2 * r - 1]) {
                runs[2 * r - 1] = maxOf(runs[2 * r - 1], position + 1)
            } else {
                runs[2 * r] = position
                runs[2 * r + 1] = position + 1
                r++
            }
        }
        return runs.copyOf(2 * r)
    }

    /**
     * Adds the mutation codes of one entry (codes of this sequence only; symbols relative to the reference) when
     * the codes need more than [addMutation]: gap codes stored as runs go into [gaps] ([withRuns]: also into its
     * run table, else that is rebuilt separately), a code for the implicit symbol is not stored, and where some
     * positions store another symbol than the reference implicitly the entry is added to the reference bitmap of
     * every such position where it has no code and is not missing. [runs]: the entry's normalised missing runs
     * of this sequence (flattened start, end pairs), only needed with a local reference.
     */
    fun addEntryMutations(
        id: Int,
        codes: IntArray,
        runs: IntArray,
        runCount: Int,
        present: Boolean,
        withRuns: Boolean,
    ) {
        val gapRunList = gapRunsOf(codes)
        for (r in 0 until gapRunList.size / 2) {
            if (withRuns) {
                gaps.add(id, gapRunList[2 * r], gapRunList[2 * r + 1])
            } else {
                gaps.addTransitions(id, gapRunList[2 * r], gapRunList[2 * r + 1])
            }
        }
        val positions = IntArray(codes.size)
        for ((i, code) in codes.withIndex()) {
            val position = MutationCode.position(code)
            positions[i] = position
            val symbol = MutationCode.symbolIndex(code)
            if (position !in 1..length || symbol == implicitSymbol(position)) continue
            if (symbol == gapSymbol && gapAsRun(position)) continue
            addMutation(id, position, symbol)
        }
        if (!present || !hasLocalReference) return
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
     * symbol keep it. Bulk load only, before [storeSparseGapsAsRuns] and [runOptimize] (replaces bitmaps; the
     * index must not be visible yet). Later writes keep the choice; correctness never depends on the implicit
     * symbol being the majority.
     */
    fun adaptLocalReference() {
        check(!gapRuns) { "the local reference is picked while all gaps are bitmaps" }
        val missingCounts = missingCountsAll()
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
                val implicit = presentCount - missingCounts[p] - stored
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
     * Moves the gaps of sparse positions from bitmaps into [gaps] runs and routes later gap codes the same way
     * ([gapRuns]). A position stays dense (bitmap) if more than 1/[DENSE_GAP_FRACTION] of the present entries
     * have a gap there, where a bitmap container costs about a bit per entry and a run several bytes (SC2's
     * lineage-defining deletions), or if the gap is its implicit symbol. A run of an entry is split at dense
     * positions. Bulk load only, after [adaptLocalReference] and before [runOptimize].
     */
    fun storeSparseGapsAsRuns() {
        check(!gapRuns) { "gaps are already stored as runs" }
        val size = alphabet.size
        val presentCount = present.cardinality.toLong()
        for (p in 1..length) {
            val count = mutationCounts[p * size + gapSymbol]
            if (implicitSymbol(p) == gapSymbol || count * DENSE_GAP_FRACTION > presentCount) denseGaps.set(p)
        }
        gapRuns = true
        val sparse = (1..length).filter { !denseGaps.get(it) && mutations[it]?.get(gapSymbol) != null }
        // one 65536-id chunk at a time, so that the per-id state is fixed-size at any number of entries; chunks
        // come in id order, as the run table's bulk append needs
        val runStart = IntArray(CHUNK)
        val lastPosition = IntArray(CHUNK)
        val perLocal = IntArray(CHUNK + 1)
        var triples = IntArray(1024)
        for (range in chunkRanges(present)) {
            val base = range[0]
            // per local id: start and last position of its open run (0 = none); a skipped position closes it
            runStart.fill(0)
            lastPosition.fill(0)
            var n = 0
            fun emit(local: Int) {
                if (n + 3 > triples.size) triples = triples.copyOf(grownArraySize(triples.size, n + 3L))
                triples[n++] = local
                triples[n++] = runStart[local]
                triples[n++] = lastPosition[local] + 1
            }
            for (p in sparse) {
                forEachIdIn(mutations[p]!![gapSymbol]!!, range[0], range[1]) { id ->
                    val local = id - base
                    if (lastPosition[local] != 0 && lastPosition[local] == p - 1) {
                        lastPosition[local] = p
                    } else {
                        if (lastPosition[local] != 0) emit(local)
                        runStart[local] = p
                        lastPosition[local] = p
                    }
                }
            }
            for (local in 0 until CHUNK) if (lastPosition[local] != 0) emit(local)
            // local ids ascending (stable counting sort; each id's runs were emitted in position order)
            perLocal.fill(0)
            for (t in 0 until n / 3) perLocal[triples[3 * t] + 1]++
            for (i in 1..CHUNK) perLocal[i] += perLocal[i - 1]
            val sorted = IntArray(n)
            for (t in 0 until n / 3) {
                val at = 3 * perLocal[triples[3 * t]]++
                sorted[at] = triples[3 * t]
                sorted[at + 1] = triples[3 * t + 1]
                sorted[at + 2] = triples[3 * t + 2]
            }
            for (t in 0 until n / 3) gaps.add(base + sorted[3 * t], sorted[3 * t + 1], sorted[3 * t + 2])
        }
        for (p in sparse) {
            val perSymbol = mutations[p]!!
            perSymbol[gapSymbol] = null
            mutationCounts[p * size + gapSymbol] = 0
            if (perSymbol.all { it == null }) mutations[p] = null
        }
        invalidateCaches()
    }

    /**
     * Entries a re-pick of the implicit symbols would stop storing: per position, how far the most common stored
     * valid symbol exceeds the implicit one (0 right after a full load; grows as updates shift the majority).
     */
    fun localReferenceExcess(): Long {
        val missingCounts = missingCountsAll()
        val gapCounts = if (gapRuns) gaps.countsAll() else null
        val presentCount = present.cardinality.toLong()
        val size = alphabet.size
        val valid = alphabet.validMutationMask
        var excess = 0L
        for (p in 1..length) {
            val gapCount = gapCounts?.get(p) ?: 0
            if ((mutations[p] == null && gapCount == 0) || reference(p) == alphabet.missingIndex) continue
            var stored = gapCount.toLong()
            var best = gapCount
            for (s in 0 until size) {
                val c = mutationCounts[p * size + s]
                stored += c
                if (valid and (1 shl s) != 0 && c > best) best = c
            }
            excess += maxOf(0L, best - (presentCount - missingCounts[p] - stored))
        }
        return excess
    }

    /**
     * bulk load: a missing run ([start] inclusive, [end] exclusive, 1-based) into both structures; runs of one
     * entry must be disjoint ([normalizeRuns]) and ids ascending
     */
    fun addMissingRun(id: Int, start: Int, end: Int) = missing.add(id, start, end)

    /** a missing run into the point-query structures only (the run table is updated via [RunTable.rebuild]) */
    fun addTransitions(id: Int, start: Int, end: Int) = missing.addTransitions(id, start, end)

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
        touchedInsertions.add(position)
    }

    /**
     * A bitmap to remove ids from, and the cardinality counter (counts[index]) to adjust. [ids]: exactly the ids
     * contained in the bitmap (small batches), or null to remove the whole batch with andNot. [kind], [slot] and
     * [owner]: where the bitmap lives, for [compactTouched] ([AT_POSITION] for mutation bitmaps; [owner] is the run
     * index of checkpoint bitmaps and of [TRANSITION] sets, whose exact [ids] are removed from its [slot]).
     */
    class Removal(
        /** null for [TRANSITION] removals, which name the set by [owner], [slot] and [start] */
        val bitmap: RoaringBitmap?,
        val counts: IntArray?,
        val index: Int,
        val ids: IntArray?,
        val kind: Int,
        val slot: Int,
        val owner: RunIndex? = null,
        val start: Boolean = false,
    )

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

        fun check(bm: RoaringBitmap, counts: IntArray?, index: Int, kind: Int, slot: Int, owner: RunIndex?): Removal? {
            if (probe == null) {
                return if (RoaringBitmap.intersects(
                        bm,
                        ids,
                    )
                ) {
                    Removal(bm, counts, index, null, kind, slot, owner)
                } else {
                    null
                }
            }
            if (!probeOnly && !RoaringBitmap.intersects(bm, ids)) return null
            var matched: IntArray? = null
            var n = 0
            for (id in probe) {
                if (bm.contains(id)) {
                    if (matched == null) matched = IntArray(probe.size)
                    matched[n++] = id
                }
            }
            return matched?.let { Removal(bm, counts, index, it.copyOf(n), kind, slot, owner) }
        }

        check(present, null, 0, PRESENT, 0, null)?.let { out.add(it) }
        val size = alphabet.size
        val chunks = (length + 1 + COLLECT_CHUNK - 1) / COLLECT_CHUNK
        val parts = pool.submit<List<List<Removal>>> {
            (0 until chunks).toList().parallelStream().map { chunk ->
                val part = ArrayList<Removal>()
                for (p in chunk * COLLECT_CHUNK until minOf(length + 2, (chunk + 1) * COLLECT_CHUNK)) {
                    if (p <= length) {
                        mutations[p]?.forEachIndexed { sym, bm ->
                            val index = p * size + sym
                            if (bm != null) check(bm, mutationCounts, index, AT_POSITION, p, null)?.let { part.add(it) }
                        }
                    }
                    for (runs in listOf(missing, gaps)) {
                        runs.starts.intersecting(p, ids)?.let {
                            part.add(Removal(null, null, p, it, TRANSITION, p, runs, start = true))
                        }
                        runs.ends.intersecting(p, ids)?.let {
                            part.add(Removal(null, null, p, it, TRANSITION, p, runs, start = false))
                        }
                    }
                }
                part
            }.toList()
        }.get()
        parts.forEach { out.addAll(it) }
        for (runs in listOf(missing, gaps)) {
            for ((k, bm) in runs.checkpoints.withIndex()) check(bm, null, 0, CHECKPOINT, k, runs)?.let { out.add(it) }
        }
        for ((position, bySymbols) in insertions) {
            for (bm in bySymbols.values) check(bm, null, 0, INSERTION, position, null)?.let { out.add(it) }
        }
    }

    /** under the write lock */
    fun remove(ids: RoaringBitmap, removals: List<Removal>) {
        for (r in removals) {
            if (r.kind == TRANSITION) {
                r.owner!!.removeTransitions(r.start, r.slot, r.ids!!)
                continue
            }
            val bitmap = r.bitmap!!
            when (r.kind) {
                AT_POSITION -> touchedPositions.set(r.slot)
                CHECKPOINT -> r.owner!!.touchedCheckpoints.set(r.slot)
                INSERTION -> touchedInsertions.add(r.slot)
                PRESENT -> presentTouched = true
            }
            val exact = r.ids
            if (exact != null) {
                for (id in exact) if (bitmap.checkedRemove(id)) r.counts?.let { it[r.index]-- }
            } else {
                if (r.counts != null) r.counts[r.index] -= RoaringBitmap.andCardinality(bitmap, ids)
                bitmap.andNot(ids)
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
        missing.runOptimize()
        gaps.runOptimize()
        insertions.values.forEach { m -> m.entries.forEach { it.setValue(runOptimizeFewRuns(it.value)) } }
        clearTouched()
    }

    private fun clearTouched() {
        touchedPositions.clear()
        touchedInsertions.clear()
        presentTouched = false
        missing.clearTouched()
        gaps.clearTouched()
    }

    /**
     * Re-compresses the bitmaps that writes changed since the bulk load or the last call (grown arrays keep up to
     * half their capacity unused, and added ids may form runs): optimised copies are made here, outside the
     * lock, and handed to [install] in batches of assignments that it runs under the write lock. Writer only;
     * readers see either the old or the new bitmap, which hold the same ids.
     */
    fun compactTouched(install: (List<() -> Unit>) -> Unit) {
        val swaps = ArrayList<() -> Unit>()
        fun flush() {
            if (swaps.isEmpty()) return
            install(ArrayList(swaps))
            swaps.clear()
        }
        fun flushIfFull() {
            if (swaps.size >= COMPACT_BATCH) flush()
        }
        fun optimized(bm: RoaringBitmap) = runOptimizeFewRuns(bm.clone())
        if (presentTouched) {
            val o = optimized(present)
            swaps.add { present = o }
        }
        var p = touchedPositions.nextSetBit(0)
        while (p >= 0) {
            mutations.getOrNull(p)?.let { perSymbol ->
                for (s in perSymbol.indices) {
                    val o = perSymbol[s]?.let { optimized(it) } ?: continue
                    swaps.add { perSymbol[s] = o }
                }
            }
            flushIfFull()
            p = touchedPositions.nextSetBit(p + 1)
        }
        missing.compactTouched(swaps, ::flushIfFull)
        gaps.compactTouched(swaps, ::flushIfFull)
        for (position in touchedInsertions) {
            val bySymbols = insertions[position] ?: continue
            for (entry in bySymbols.entries) {
                val o = optimized(entry.value)
                swaps.add { entry.setValue(o) }
            }
            flushIfFull()
        }
        flush()
        clearTouched()
    }

    fun memoryBytes(): Long {
        var total = heapBytes(present)
        for (perSymbol in mutations) {
            if (perSymbol == null) continue
            total += arrayBytes(4L * perSymbol.size)
            for (bm in perSymbol) if (bm != null) total += heapBytes(bm)
        }
        total += missing.memoryBytes() + gaps.memoryBytes()
        insertions.values.forEach { m -> m.values.forEach { total += heapBytes(it) + 64 } }
        return total + mutations.size * 4L + mutationCounts.size * 4L + arrayBytes(localReference.size.toLong()) +
            arrayBytes(4L * localReferencePositions.size) + denseGaps.size() / 8
    }

    // ---------------- reads ----------------

    /** ids having the missing symbol at [position] (fresh bitmap) */
    fun missingAt(position: Int): RoaringBitmap = missing.at(position)

    /** ids with a gap at [position] stored as a run (fresh bitmap), or null if gaps at [position] are bitmaps */
    fun gapRunsAt(position: Int): RoaringBitmap? = if (gapAsRun(position)) gaps.at(position) else null

    /** missing counts per position (index = position) over [ids] */
    fun missingCountsOver(ids: RoaringBitmap): IntArray = missing.countsOver(ids)

    /** missing counts per position (index = position) over all present ids (cached until the next write) */
    fun missingCountsAll(): IntArray = missing.countsAll()

    /** symbols (mask over alphabet indices) at [position] matching SILO's SymbolInSet over live ids */
    fun symbolInSet(position: Int, mask: Int): RoaringBitmap {
        if (position < 1 || position > length) return RoaringBitmap()
        // ids with the implicit symbol = present \ missing \ gap runs \ all stored bitmaps of the position
        val implicit = implicitSymbol(position)
        val missingSymbol = alphabet.missingIndex
        val includesImplicit = mask and (1 shl implicit) != 0
        val includesMissing = mask and (1 shl missingSymbol) != 0
        val perSymbol = mutations[position]
        val inSet = ArrayList<RoaringBitmap>()
        val notInSet = ArrayList<RoaringBitmap>()
        if (perSymbol != null) {
            for (s in perSymbol.indices) {
                val bm = perSymbol[s] ?: continue
                if (s == implicit || s == missingSymbol) continue
                if (mask and (1 shl s) != 0) inSet.add(bm) else notInSet.add(bm)
            }
        }
        // gaps stored as runs are never the implicit symbol ([storeSparseGapsAsRuns])
        gapRunsAt(position)?.let { if (mask and (1 shl gapSymbol) != 0) inSet.add(it) else notInSet.add(it) }
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
        private const val COLLECT_CHUNK = 1024
        private const val PROBE_LIMIT = 256
        private const val PROBE_ONLY_LIMIT = 16

        /**
         * gaps at a position carried by more than 1/16 of the present entries stay bitmaps: in one 65536-id chunk
         * that is where an array container (2 B per id) turns into a bitmap container (8 KB)
         */
        const val DENSE_GAP_FRACTION = 16

        /** ids per roaring chunk */
        private const val CHUNK = 1 shl 16

        /** bitmaps swapped per write-lock hold in [compactTouched] */
        private const val COMPACT_BATCH = 4096

        /** [Removal.kind] */
        const val AT_POSITION = 0
        const val CHECKPOINT = 1
        const val INSERTION = 2
        const val PRESENT = 3
        const val TRANSITION = 4

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
