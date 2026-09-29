package org.loculus.backend.query.index

import org.loculus.backend.query.schema.MutationCode
import org.loculus.backend.query.schema.QuerySchema

/**
 * One projection entry as the in-memory index consumes it (query_entries + query_mutation_data).
 *
 * [values] is aligned with [QuerySchema.metadata]: String for string fields, a Number for int/float fields,
 * a 'YYYY-MM-DD' String (or an Int epoch day) for dates, Boolean for booleans, null for missing.
 * [mutations] are [MutationCode]s, [missing] flattened (seqIndex, start, endExclusive) triples (1-based),
 * [insertions] '<seqIndex>:<position>:<SYMBOLS>' strings — exactly the query_mutation_data columns.
 */
class IndexRow(
    val id: Int,
    val values: Array<Any?>,
    val presentSequences: IntArray,
    val mutations: IntArray,
    val missing: IntArray,
    val insertions: List<String>,
) {
    companion object {
        /** convenience for tests: metadata by field name (unknown names are rejected) */
        fun of(
            schema: QuerySchema,
            id: Int,
            metadata: Map<String, Any?>,
            presentSequences: IntArray = IntArray(0),
            mutations: IntArray = IntArray(0),
            missing: IntArray = IntArray(0),
            insertions: List<String> = emptyList(),
        ): IndexRow {
            val values = arrayOfNulls<Any?>(schema.metadata.size)
            metadata.forEach { (name, value) ->
                val index = schema.metadata.indexOfFirst { it.name == name }
                require(index >= 0) { "unknown field $name" }
                values[index] = value
            }
            return IndexRow(id, values, presentSequences, mutations, missing, insertions)
        }

        /**
         * Builds a row from aligned sequences (by sequence/gene name; null or absent = no sequence) the same way
         * the projector encodes them: every symbol that is neither the reference nor the missing symbol becomes
         * a mutation code, runs of the missing symbol become missing ranges.
         * [insertions]: sequence name -> list of "position:SYMBOLS".
         */
        fun fromAlignedSequences(
            schema: QuerySchema,
            id: Int,
            metadata: Map<String, Any?>,
            sequences: Map<String, String?>,
            insertions: Map<String, List<String>> = emptyMap(),
        ): IndexRow {
            val present = mutableListOf<Int>()
            val mutations = mutableListOf<Int>()
            val missing = mutableListOf<Int>()
            for (seq in schema.allSequences()) {
                val aligned = sequences[seq.name] ?: continue
                require(aligned.length == seq.length) {
                    "sequence ${seq.name} has length ${aligned.length}, expected ${seq.length}"
                }
                present += seq.index
                val alphabet = seq.alphabet
                var runStart = -1
                for (i in aligned.indices) {
                    val position = i + 1
                    val symbol = alphabet.indexOf(aligned[i])
                    require(symbol >= 0) { "invalid symbol ${aligned[i]} in ${seq.name}" }
                    if (symbol == alphabet.missingIndex) {
                        if (runStart < 0) runStart = position
                        continue
                    }
                    if (runStart >= 0) {
                        missing += listOf(seq.index, runStart, position)
                        runStart = -1
                    }
                    if (symbol != seq.referenceSymbolIndex(position)) {
                        mutations += MutationCode.encode(seq.index, position, symbol)
                    }
                }
                if (runStart >= 0) missing += listOf(seq.index, runStart, aligned.length + 1)
            }
            val insertionStrings = insertions.flatMap { (name, list) ->
                val seq = schema.allSequences().first { it.name == name }
                list.map { "${seq.index}:$it" }
            }
            return of(
                schema,
                id,
                metadata,
                present.toIntArray(),
                mutations.toIntArray(),
                missing.toIntArray(),
                insertionStrings,
            )
        }
    }
}
