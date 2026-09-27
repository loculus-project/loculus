package org.loculus.backend.query.api

import org.loculus.backend.query.index.InsertionRow
import org.loculus.backend.query.index.MutationRow
import org.loculus.backend.query.request.OrderByField
import org.loculus.backend.query.request.QueryRequest
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.schema.SequenceType

/** A computed tabular result, ready to be written. */
class Table(val shape: TableShape, val rows: List<Row>)

/**
 * Builds /nucleotideMutations, /aminoAcidMutations, /nucleotideInsertions, /aminoAcidInsertions tables
 * exactly like LAPIS 0.8.8 / SILO 0.14.3.
 */
object MutationTables {
    /** JSON key order of mutation rows */
    val MUTATION_COLUMNS = listOf(
        "mutation",
        "count",
        "coverage",
        "proportion",
        "sequenceName",
        "mutationFrom",
        "mutationTo",
        "position",
    )

    /** SILO's result columns (order of the "Allowed values" error message); `mutation` is made of the first 4 */
    private val SILO_MUTATION_COLUMNS = listOf(
        "mutationFrom",
        "mutationTo",
        "sequenceName",
        "position",
        "proportion",
        "coverage",
        "count",
    )
    private val MUTATION_PARTS = listOf("mutationFrom", "mutationTo", "sequenceName", "position")
    private val MUTATION_ORDER_EXPANSION = listOf("sequenceName", "mutationFrom", "position", "mutationTo")

    val INSERTION_COLUMNS = listOf("insertion", "count", "insertedSymbols", "position", "sequenceName")
    private val SILO_INSERTION_COLUMNS = listOf("position", "insertedSymbols", "sequenceName", "count")
    private val INSERTION_ORDER_EXPANSION = listOf("sequenceName", "position", "insertedSymbols")

    fun mutations(schema: QuerySchema, type: SequenceType, rows: List<MutationRow>, request: QueryRequest): Table {
        val names = sequenceNames(schema)
        val singleSegmentNucleotide = type == SequenceType.NUCLEOTIDE && schema.isSingleSegmented
        val full = rows.map { r ->
            val name = names[r.sequenceIndex]
            val core = "${r.symbolFrom}${r.position}${r.symbolTo}"
            arrayOf<Any?>(
                if (singleSegmentNucleotide) core else "$name:$core",
                r.count,
                r.coverage,
                r.proportion,
                if (singleSegmentNucleotide) null else name,
                r.symbolFrom.toString(),
                r.symbolTo.toString(),
                r.position,
            )
        }

        val selected = request.fields.toSet()
        val allowed = if (selected.isEmpty()) {
            SILO_MUTATION_COLUMNS
        } else {
            SILO_MUTATION_COLUMNS.filter { it in selected || ("mutation" in selected && it in MUTATION_PARTS) }
        }
        val orderBy = expandOrderBy(request.orderBy, "mutation", MUTATION_ORDER_EXPANSION)
        validateOrderBy(orderBy, allowed)
        val ordered = applyPipeline(full, MUTATION_COLUMNS, orderBy, request.random, request.offset, request.limit)
        return project(MUTATION_COLUMNS, selected, ordered)
    }

    fun insertions(schema: QuerySchema, type: SequenceType, rows: List<InsertionRow>, request: QueryRequest): Table {
        val names = sequenceNames(schema)
        val singleSegmentNucleotide = type == SequenceType.NUCLEOTIDE && schema.isSingleSegmented
        val full = rows.map { r ->
            val name = names[r.sequenceIndex]
            arrayOf<Any?>(
                if (singleSegmentNucleotide) {
                    "ins_${r.position}:${r.insertedSymbols}"
                } else {
                    "ins_$name:${r.position}:${r.insertedSymbols}"
                },
                r.count,
                r.insertedSymbols,
                r.position,
                if (singleSegmentNucleotide) null else name,
            )
        }
        val orderBy = expandOrderBy(request.orderBy, "insertion", INSERTION_ORDER_EXPANSION)
        validateOrderBy(orderBy, SILO_INSERTION_COLUMNS)
        val ordered = applyPipeline(full, INSERTION_COLUMNS, orderBy, request.random, request.offset, request.limit)
        return project(INSERTION_COLUMNS, request.fields.toSet(), ordered)
    }

    private fun sequenceNames(schema: QuerySchema): Map<Int, String> =
        schema.allSequences().associate { it.index to it.name }

    private fun expandOrderBy(orderBy: List<OrderByField>, compound: String, parts: List<String>) =
        orderBy.flatMap { o -> if (o.field == compound) parts.map { OrderByField(it, o.direction) } else listOf(o) }

    /** keeps the canonical column order, restricted to [selected] (all if empty) */
    private fun project(columns: List<String>, selected: Set<String>, rows: List<Row>): Table {
        if (selected.isEmpty()) return Table(TableShape(columns), rows)
        val keep = columns.indices.filter { columns[it] in selected }.toIntArray()
        return Table(
            TableShape(keep.map { columns[it] }),
            rows.map { row -> Array(keep.size) { row[keep[it]] } },
        )
    }
}
