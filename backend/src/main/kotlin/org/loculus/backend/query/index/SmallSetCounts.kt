package org.loculus.backend.query.index

import org.loculus.backend.query.schema.MutationCode
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.schema.SequenceSchema
import org.loculus.backend.query.schema.SequenceType
import kotlin.math.ceil

/**
 * Mutation / insertion counts computed directly from a few projection rows, with the same semantics as the
 * bitmap path: the symbol at p is the code's symbol if the row has a code at p, else the missing symbol if p is
 * in one of the row's missing runs, else the reference symbol; coverage counts only valid symbols.
 */
internal object SmallSetCounts {
    fun mutations(
        schema: QuerySchema,
        rows: List<IndexRow>,
        type: SequenceType,
        minProportion: Double,
    ): List<MutationRow> {
        val seqs = if (type == SequenceType.NUCLEOTIDE) schema.nucleotideSequences else schema.genes
        val result = ArrayList<MutationRow>()
        for (seq in seqs) {
            val present = rows.filter { seq.index in it.presentSequences }
            if (present.isNotEmpty()) mutationsOf(seq, present, minProportion, result)
        }
        return result
    }

    private fun mutationsOf(
        seq: SequenceSchema,
        rows: List<IndexRow>,
        minProportion: Double,
        out: MutableList<MutationRow>,
    ) {
        val alphabet = seq.alphabet
        val size = alphabet.size
        val lowCode = seq.index shl 23
        val highCode = (seq.index + 1) shl 23
        // codes of all rows (each row's codes deduplicated) and each row's normalised missing runs
        var codes = IntArray(256)
        var nCodes = 0
        val runs = arrayOfNulls<IntArray>(rows.size)
        val runCounts = IntArray(rows.size)
        for ((r, row) in rows.withIndex()) {
            val own = row.mutations.filter { it in lowCode until highCode }.distinct()
            if (nCodes + own.size > codes.size) codes = codes.copyOf(maxOf(codes.size * 2, nCodes + own.size))
            for (c in own) codes[nCodes++] = c
            val rowRuns = IntArray(2 * (row.missing.size / 3))
            var n = 0
            for (t in 0 until row.missing.size / 3) {
                if (row.missing[3 * t] != seq.index) continue
                rowRuns[2 * n] = row.missing[3 * t + 1]
                rowRuns[2 * n + 1] = row.missing[3 * t + 2]
                n++
            }
            runCounts[r] = SequenceIndex.normalizeRuns(rowRuns, n)
            runs[r] = rowRuns
        }
        java.util.Arrays.sort(codes, 0, nCodes)
        val counts = LongArray(size)
        var i = 0
        while (i < nCodes) {
            val position = MutationCode.position(codes[i])
            counts.fill(0)
            var codeTotal = 0L
            while (i < nCodes && MutationCode.position(codes[i]) == position) {
                val symbol = MutationCode.symbolIndex(codes[i])
                if (symbol < size) {
                    counts[symbol]++
                    codeTotal++
                }
                i++
            }
            if (position < 1 || position > seq.length) continue
            var missing = 0L
            for (r in rows.indices) if (covers(runs[r]!!, runCounts[r], position)) missing++
            val ref = seq.referenceSymbolIndex(position)
            // the implicit reference symbol: present rows without a code or a missing run at this position
            counts[ref] += rows.size - codeTotal - missing
            var coverage = 0L
            for (s in 0 until size) if (alphabet.validMutationMask and (1 shl s) != 0) coverage += counts[s]
            if (coverage <= 0) continue
            val threshold = if (minProportion == 0.0) 0 else ceil(coverage.toDouble() * minProportion).toLong() - 1
            for (s in 0 until size) {
                if (s == ref || alphabet.validMutationMask and (1 shl s) == 0) continue
                if (counts[s] > threshold) {
                    out.add(
                        MutationRow(
                            seq.index,
                            position,
                            alphabet.symbols[ref],
                            alphabet.symbols[s],
                            counts[s],
                            coverage,
                        ),
                    )
                }
            }
        }
    }

    /** whether one of the sorted, disjoint [start, end) runs covers [position] */
    private fun covers(runs: IntArray, count: Int, position: Int): Boolean {
        var lo = 0
        var hi = count - 1
        while (lo <= hi) {
            val mid = (lo + hi) ushr 1
            when {
                runs[2 * mid + 1] <= position -> lo = mid + 1
                runs[2 * mid] > position -> hi = mid - 1
                else -> return true
            }
        }
        return false
    }

    fun insertions(schema: QuerySchema, rows: List<IndexRow>, type: SequenceType): List<InsertionRow> {
        val seqs = if (type == SequenceType.NUCLEOTIDE) schema.nucleotideSequences else schema.genes
        val order = seqs.withIndex().associate { (i, s) -> s.index to i }
        // (seqIndex, position, symbols) -> number of rows having it
        val counts = HashMap<Triple<Int, Int, String>, Long>()
        for (row in rows) {
            val own = HashSet<Triple<Int, Int, String>>()
            for (insertion in row.insertions) {
                val first = insertion.indexOf(':')
                val second = insertion.indexOf(':', first + 1)
                if (first < 0 || second < 0) continue
                val seqIndex = insertion.substring(0, first).toIntOrNull() ?: continue
                if (seqIndex !in order || seqIndex !in row.presentSequences) continue
                val position = insertion.substring(first + 1, second).toIntOrNull() ?: continue
                own.add(Triple(seqIndex, position, insertion.substring(second + 1)))
            }
            own.forEach { counts.merge(it, 1L, Long::plus) }
        }
        return counts.entries
            .sortedWith(compareBy({ order.getValue(it.key.first) }, { it.key.second }, { it.key.third }))
            .map { InsertionRow(it.key.first, it.key.second, it.key.third, it.value) }
    }
}
