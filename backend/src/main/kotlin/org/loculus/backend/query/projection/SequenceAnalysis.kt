package org.loculus.backend.query.projection

import org.loculus.backend.api.Insertion
import org.loculus.backend.query.schema.Alphabet
import org.loculus.backend.query.schema.MutationCode
import org.loculus.backend.query.schema.SequenceSchema

/** Minimal growable int array (avoids boxing). */
class IntList(initialCapacity: Int = 16) {
    private var data = IntArray(initialCapacity)
    var size = 0
        private set

    fun add(value: Int) {
        if (size == data.size) data = data.copyOf(maxOf(16, data.size * 2))
        data[size++] = value
    }

    operator fun get(index: Int): Int = data[index]

    fun clear() {
        size = 0
    }

    fun toIntArray(): IntArray = data.copyOf(size)
}

/**
 * Byte -> symbol index lookup for an alphabet. Lower case letters map like upper case letters.
 * Bytes that are not a symbol of the alphabet map to the alphabet's missing symbol (N / X).
 */
class SymbolTable(val alphabet: Alphabet) {
    val table = IntArray(256) { b -> alphabet.indexOf(b.toChar()).let { if (it < 0) alphabet.missingIndex else it } }
}

private val symbolTables = mapOf(
    Alphabet.NUCLEOTIDE.name to SymbolTable(Alphabet.NUCLEOTIDE),
    Alphabet.AMINO_ACID.name to SymbolTable(Alphabet.AMINO_ACID),
)

/**
 * Pure functions deriving the query_mutation_data arrays from sequences.
 */
object SequenceAnalysis {
    /**
     * Scans the aligned sequence `sequence[0 until length]` of [schema] and appends
     * - to [mutations]: [MutationCode] of every position whose symbol is neither the reference symbol nor the missing
     *   symbol (N / X)
     * - to [missing]: triples (seqIndex, start, endExclusive), 1-based, of maximal runs of the missing symbol.
     *
     * Symbols are case-insensitive. Characters that are not part of the alphabet are treated as the missing symbol.
     * If the sequence is shorter than the reference, the remaining positions count as missing; symbols beyond the
     * reference length are ignored (aligned sequences always have the reference length).
     */
    fun analyzeAligned(schema: SequenceSchema, sequence: ByteArray, length: Int, mutations: IntList, missing: IntList) {
        val referenceLength = schema.length
        if (referenceLength == 0) return
        val table = symbolTables.getValue(schema.alphabet.name).table
        val missingIndex = schema.alphabet.missingIndex
        val referenceSymbols = schema.referenceSymbols
        val seqIndex = schema.index
        val scanned = minOf(length, referenceLength)
        val encodablePositions = minOf(scanned, MutationCode.MAX_POSITION)
        var runStart = -1
        var i = 0
        while (i < scanned) {
            val symbol = table[sequence[i].toInt() and 0xFF]
            val position = i + 1
            if (symbol == missingIndex) {
                if (runStart < 0) runStart = position
            } else {
                if (runStart >= 0) {
                    missing.add(seqIndex)
                    missing.add(runStart)
                    missing.add(position)
                    runStart = -1
                }
                if (symbol != referenceSymbols[position].toInt() && position <= encodablePositions) {
                    mutations.add(MutationCode.encode(seqIndex, position, symbol))
                }
            }
            i++
        }
        if (scanned < referenceLength && runStart < 0) runStart = scanned + 1
        if (runStart >= 0) {
            missing.add(seqIndex)
            missing.add(runStart)
            missing.add(referenceLength + 1)
        }
    }

    /** "<seqIndex>:<position>:<SYMBOLS>" (symbols upper-cased), as stored in query_mutation_data.insertions */
    fun formatInsertion(seqIndex: Int, insertion: Insertion): String =
        "$seqIndex:${insertion.position}:${insertion.sequence.uppercase()}"
}
