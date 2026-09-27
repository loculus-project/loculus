package org.loculus.backend.query.schema

/**
 * Symbol alphabets with the same ordering and IUPAC ambiguity semantics as SILO
 * (rhydb/common/nucleotide_symbols.* and aa_symbols.* in LAPIS-SILO v0.14.3).
 *
 * Symbol indices are part of the persisted encoding (see [MutationCode]) and must never be reordered.
 */
class Alphabet private constructor(
    val name: String,
    /** symbols in SILO enum order; index = symbol id */
    val symbols: CharArray,
    /** the symbol that stands for "missing data" (N / X); stored as ranges, never as mutations */
    val missingSymbol: Char,
    /** symbols that count towards coverage and may be reported as mutations */
    val validMutationSymbols: Set<Char>,
    codesFor: Map<Char, Set<Char>>,
) {
    val missingIndex: Int = indexOf(missingSymbol)
    val size: Int get() = symbols.size

    private val charToIndex = IntArray(128) { -1 }.also { table ->
        symbols.forEachIndexed { i, c ->
            table[c.code] = i
            table[c.lowercaseChar().code] = i
        }
    }

    /** AMBIGUITY_SYMBOLS[s] = all symbols whose code set is a superset of s's code set (bitmask over indices) */
    val ambiguitySymbols: IntArray = IntArray(symbols.size) { i ->
        val codes = codesFor.getValue(symbols[i])
        var mask = 0
        symbols.forEachIndexed { j, candidate ->
            if (codesFor.getValue(candidate).containsAll(codes)) mask = mask or (1 shl j)
        }
        mask
    }

    val validMutationMask: Int = symbols.indices
        .filter { symbols[it] in validMutationSymbols }
        .fold(0) { acc, i -> acc or (1 shl i) }

    fun indexOf(c: Char): Int = if (c.code < 128) charToIndex[c.code] else -1

    fun isValid(c: Char) = indexOf(c) >= 0

    companion object {
        val NUCLEOTIDE: Alphabet = run {
            val symbols = "-ACGTRYSWKMBDHVN".toCharArray()
            val codes = mapOf(
                '-' to setOf('-'),
                'A' to setOf('A'),
                'C' to setOf('C'),
                'G' to setOf('G'),
                'T' to setOf('T'),
                'R' to setOf('A', 'G'),
                'Y' to setOf('C', 'T'),
                'S' to setOf('G', 'C'),
                'W' to setOf('A', 'T'),
                'K' to setOf('G', 'T'),
                'M' to setOf('A', 'C'),
                'B' to setOf('C', 'G', 'T'),
                'D' to setOf('A', 'G', 'T'),
                'H' to setOf('A', 'C', 'T'),
                'V' to setOf('A', 'C', 'G'),
                'N' to symbols.toSet(),
            )
            Alphabet("nucleotide", symbols, 'N', setOf('-', 'A', 'C', 'G', 'T'), codes)
        }

        val AMINO_ACID: Alphabet = run {
            val symbols = "-ACDEFGHIKLMNOPQRSTUVWYBJZ*X".toCharArray()
            val codes = symbols.associateWith { setOf(it) }.toMutableMap()
            codes['B'] = setOf('D', 'N')
            codes['J'] = setOf('L', 'I')
            codes['Z'] = setOf('Q', 'E')
            codes['X'] = symbols.toSet()
            Alphabet("amino acid", symbols, 'X', symbols.filter { it !in "BJZX" }.toSet(), codes)
        }
    }
}

/**
 * Persisted integer encoding of "sequence [seqIndex] has symbol [symbol] at 1-based [position]".
 * Used in the `query_mutation_data` arrays (Postgres int4[]) and as in-memory index keys.
 *
 *   code = (seqIndex shl 23) or (position shl 5) or symbolIndex
 *
 * 8 bits sequence index (<= 255 segments/genes), 18 bits position (<= 262143), 5 bits symbol (< 32).
 */
object MutationCode {
    const val MAX_SEQUENCES = 255
    const val MAX_POSITION = (1 shl 18) - 1

    fun encode(seqIndex: Int, position: Int, symbolIndex: Int): Int =
        (seqIndex shl 23) or (position shl 5) or symbolIndex

    fun seqIndex(code: Int) = code ushr 23

    fun position(code: Int) = (code ushr 5) and MAX_POSITION

    fun symbolIndex(code: Int) = code and 31
}
