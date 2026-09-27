package org.loculus.backend.query.index

import org.loculus.backend.query.filter.And
import org.loculus.backend.query.filter.Filter
import org.loculus.backend.query.filter.HasMutation
import org.loculus.backend.query.filter.Maybe
import org.loculus.backend.query.filter.NOf
import org.loculus.backend.query.filter.Not
import org.loculus.backend.query.filter.Or
import org.loculus.backend.query.filter.SymbolEquals
import org.loculus.backend.query.filter.True
import org.loculus.backend.query.schema.FieldType
import org.loculus.backend.query.schema.MetadataField
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.schema.SequenceSchema
import org.loculus.backend.query.schema.SequenceType
import kotlin.math.ceil

object IndexTestSupport {
    fun schema(
        metadata: List<MetadataField> = defaultMetadata,
        nucleotide: Map<String, String> = mapOf("main" to "ACGTACGTACGTACGTACGTCAGTACGTAC"),
        genes: Map<String, String> = mapOf("E" to "MYSFVSEETGTLIVNSVLLF*"),
    ): QuerySchema {
        val nuc = nucleotide.entries.mapIndexed { i, (name, ref) ->
            SequenceSchema(name, SequenceType.NUCLEOTIDE, i, ref)
        }
        val aa = genes.entries.mapIndexed { i, (name, ref) ->
            SequenceSchema(name, SequenceType.AMINO_ACID, nuc.size + i, ref)
        }
        return QuerySchema(
            organism = "test",
            instanceName = "test",
            primaryKey = "accessionVersion",
            metadata = metadata,
            nucleotideSequences = nuc,
            genes = aa,
            features = emptySet(),
            lineageDefinitions = emptyMap(),
        )
    }

    val defaultMetadata = listOf(
        MetadataField("accessionVersion", FieldType.STRING),
        MetadataField("country", FieldType.STRING, generateIndex = true),
        MetadataField("lineage", FieldType.STRING, lineageSystem = "pango"),
        MetadataField("age", FieldType.INT),
        MetadataField("score", FieldType.FLOAT),
        MetadataField("date", FieldType.DATE),
        MetadataField("isRevocation", FieldType.BOOLEAN),
    )
}

/** straightforward reference implementation over aligned sequences */
class Oracle(val schema: QuerySchema, val rows: Map<Int, Map<String, String?>>) {
    private val mode = arrayOf("NONE", "UPPER", "LOWER")

    fun evaluate(filter: Filter): Set<Int> = rows.keys.filter { matches(it, filter, 0) }.toSet()

    private fun symbolAt(id: Int, seqIndex: Int, position: Int): Char? {
        val seq = schema.allSequences().first { it.index == seqIndex }
        return rows.getValue(id)[seq.name]?.get(position - 1)
    }

    private fun matches(id: Int, filter: Filter, m: Int): Boolean = when (filter) {
        True -> true

        is And -> filter.children.all { matches(id, it, m) }

        is Or -> filter.children.any { matches(id, it, m) }

        is Not -> !matches(
            id,
            filter.child,
            if (m == 1) {
                2
            } else if (m == 2) {
                1
            } else {
                0
            },
        )

        is Maybe -> matches(id, filter.child, 1)

        is NOf -> {
            val count = filter.children.count { matches(id, it, m) }
            if (filter.exactly) count == filter.n else count >= filter.n
        }

        is SymbolEquals -> {
            val seq = schema.allSequences().first { it.index == filter.sequenceIndex }
            val c = symbolAt(id, filter.sequenceIndex, filter.position)
            if (c == null) {
                false
            } else {
                val idx = seq.alphabet.indexOf(c)
                if (mode[m] == "UPPER") {
                    seq.alphabet.ambiguitySymbols[filter.symbolIndex] and (1 shl idx) != 0
                } else {
                    idx == filter.symbolIndex
                }
            }
        }

        is HasMutation -> {
            val seq = schema.allSequences().first { it.index == filter.sequenceIndex }
            val c = symbolAt(id, filter.sequenceIndex, filter.position)
            if (c == null) {
                false
            } else {
                val idx = seq.alphabet.indexOf(c)
                val ref = seq.referenceSymbolIndex(filter.position)
                if (mode[m] == "UPPER") idx != ref else seq.alphabet.ambiguitySymbols[ref] and (1 shl idx) == 0
            }
        }

        else -> error("oracle does not support $filter")
    }

    fun mutations(ids: Set<Int>, type: SequenceType, minProportion: Double): List<MutationRow> {
        val result = mutableListOf<MutationRow>()
        val seqs = if (type == SequenceType.NUCLEOTIDE) schema.nucleotideSequences else schema.genes
        for (seq in seqs) {
            val alphabet = seq.alphabet
            for (p in 1..seq.length) {
                val counts = LongArray(alphabet.size)
                for (id in ids) {
                    val s = rows.getValue(id)[seq.name] ?: continue
                    counts[alphabet.indexOf(s[p - 1])]++
                }
                val coverage = (0 until alphabet.size).filter { alphabet.validMutationMask and (1 shl it) != 0 }
                    .sumOf { counts[it] }
                if (coverage == 0L) continue
                val threshold = if (minProportion == 0.0) 0 else ceil(coverage * minProportion).toLong() - 1
                val ref = seq.referenceSymbolIndex(p)
                for (s in 0 until alphabet.size) {
                    if (s == ref || alphabet.validMutationMask and (1 shl s) == 0) continue
                    if (counts[s] > threshold) {
                        result +=
                            MutationRow(seq.index, p, alphabet.symbols[ref], alphabet.symbols[s], counts[s], coverage)
                    }
                }
            }
        }
        return result
    }
}
