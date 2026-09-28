package org.loculus.backend.query.index

import org.roaringbitmap.RoaringBitmap
import java.util.BitSet

/**
 * All ids of the index in the order `select()` sorts them by one column: key order in the [descending] direction,
 * ties by ascending id, nulls where the sort puts them. A page ordered by that column then walks [order] and stops
 * after offset + limit matches, instead of a top-k or a full sort over all matches.
 *
 * The opposite direction is the reverse order of runs of equal keys with ids still ascending inside each run, so
 * it walks the runs backwards ([runStarts]) and each run forwards. A sort by several keys whose first key is
 * [column] walks whole runs and sorts the candidates by all keys.
 *
 * Entries changed after the build are not in their place in [order]: the index keeps them in a stale set, the walk
 * skips them and `select()` sorts them in with the candidates; the index rebuilds the permutation once the stale set
 * passes a threshold.
 */
internal class SortPermutation(
    val column: Column,
    val descending: Boolean,
    val order: IntArray,
    /** positions in [order] where a new key starts (always contains 0 unless empty) */
    private val runStarts: BitSet,
) {
    /**
     * Ids of [live] \ [stale] in permutation order until at least [k] are found: in the permutation's direction if
     * [forward], else in the opposite one. With [wholeRuns] the run of equal keys holding the k-th id is completed.
     * Null if more than [maxCandidates] would be returned or more than [maxSteps] positions visited (a selection
     * whose ids sit late in this order, e.g. old dates under a descending sort).
     */
    fun candidates(
        live: RoaringBitmap,
        stale: RoaringBitmap?,
        k: Int,
        forward: Boolean,
        wholeRuns: Boolean,
        maxCandidates: Int,
        maxSteps: Long,
    ): IntArray? {
        var out = IntArray(minOf(k, 1024).coerceAtLeast(16))
        var count = 0
        var steps = 0L
        fun take(id: Int): Boolean {
            if (++steps > maxSteps) return false
            if ((stale != null && stale.contains(id)) || !live.contains(id)) return true
            if (count == maxCandidates) return false
            if (count == out.size) out = out.copyOf(minOf(maxCandidates, out.size * 2).coerceAtLeast(count + 1))
            out[count++] = id
            return true
        }
        if (forward) {
            var p = 0
            while (p < order.size) {
                if (count >= k && (!wholeRuns || runStarts.get(p))) break
                if (!take(order[p])) return null
                p++
            }
        } else {
            var end = order.size - 1
            outer@ while (end >= 0 && count < k) {
                val start = runStarts.previousSetBit(end)
                for (q in start..end) {
                    if (!take(order[q])) return null
                    if (!wholeRuns && count >= k) break@outer
                }
                end = start - 1
            }
        }
        return if (count == out.size) out else out.copyOf(count)
    }

    fun memoryBytes(): Long = arrayBytes(4L * order.size) + arrayBytes(runStarts.size() / 8L)

    companion object {
        /** [sorted]: all ids in sort order; [key]: the sort key of an id (equal keys form a run) */
        fun of(column: Column, descending: Boolean, sorted: IntArray, key: (Int) -> Long): SortPermutation {
            val runStarts = BitSet(sorted.size)
            var previous = 0L
            for (p in sorted.indices) {
                val k = key(sorted[p])
                if (p == 0 || k != previous) runStarts.set(p)
                previous = k
            }
            return SortPermutation(column, descending, sorted, runStarts)
        }
    }
}
