package org.loculus.backend.query.filter

/**
 * Filter AST of the query engine. Produced by the request parser (LAPIS parameters + advancedQuery),
 * consumed by the evaluators. Semantics follow SILO v0.14.3 exactly (see LAPIS_SEMANTICS.md).
 *
 * Field names are canonical (as in the schema, not as typed by the user). Positions are 1-based.
 * Sequences are referenced by their schema index (see QuerySchema / SequenceSchema.index).
 */
sealed interface Filter

data object True : Filter

data class And(val children: List<Filter>) : Filter

data class Or(val children: List<Filter>) : Filter

data class Not(val child: Filter) : Filter

/** at least [n] (or exactly [n] if [exactly]) of [children] match */
data class NOf(val n: Int, val exactly: Boolean, val children: List<Filter>) : Filter

/** evaluates [child] in ambiguity mode UPPER_BOUND (flipped to LOWER_BOUND under an odd number of Nots) */
data class Maybe(val child: Filter) : Filter

// ---------------- metadata ----------------

/** value == null means "is null" */
data class StringEquals(val field: String, val value: String?) : Filter

/** RE2 partial match; null values are matched as the empty string */
data class StringRegex(val field: String, val pattern: String) : Filter

/** value == null means "is null" */
data class IntEquals(val field: String, val value: Long?) : Filter

/** inclusive bounds, nulls excluded; a null bound is unbounded */
data class IntBetween(val field: String, val from: Long?, val to: Long?) : Filter

data class FloatEquals(val field: String, val value: Double?) : Filter

data class FloatBetween(val field: String, val from: Double?, val to: Double?) : Filter

/** dates as epoch days; value == null means "is null" */
data class DateEquals(val field: String, val value: Int?) : Filter

data class DateBetween(val field: String, val from: Int?, val to: Int?) : Filter

data class BooleanEquals(val field: String, val value: Boolean?) : Filter

/** is null, for any field type */
data class IsNull(val field: String) : Filter

/**
 * Lineage field equals one of [lineages] (canonical names, already expanded to sublineages by the parser),
 * or is null if [lineages] is null.
 */
data class LineageIn(val field: String, val lineages: Set<String>?) : Filter

// ---------------- sequences ----------------

/**
 * Sequence [sequenceIndex] has exactly symbol [symbolIndex] at [position] (ambiguity mode NONE);
 * under Maybe: any symbol in AMBIGUITY_SYMBOLS[symbol].
 * The symbol "." is resolved to the reference symbol by the parser.
 */
data class SymbolEquals(val sequenceIndex: Int, val position: Int, val symbolIndex: Int) : Filter

/**
 * Sequence [sequenceIndex] has a mutation at [position]:
 * NONE: symbol not in AMBIGUITY_SYMBOLS[reference]; UPPER_BOUND (maybe): symbol != reference.
 */
data class HasMutation(val sequenceIndex: Int, val position: Int) : Filter

/**
 * Sequence [sequenceIndex] has an insertion at [position] whose inserted symbols fully match [regex]
 * (RE2 syntax, already translated: '?' -> '.*', aa '*' -> '\*', upper-cased).
 */
data class InsertionContains(val sequenceIndex: Int, val position: Int, val regex: String) : Filter

/** all fields referenced by a filter (for lazily loading index columns) */
fun Filter.referencedFields(): Set<String> = when (this) {
    True -> emptySet()
    is And -> children.flatMap { it.referencedFields() }.toSet()
    is Or -> children.flatMap { it.referencedFields() }.toSet()
    is Not -> child.referencedFields()
    is NOf -> children.flatMap { it.referencedFields() }.toSet()
    is Maybe -> child.referencedFields()
    is StringEquals -> setOf(field)
    is StringRegex -> setOf(field)
    is IntEquals -> setOf(field)
    is IntBetween -> setOf(field)
    is FloatEquals -> setOf(field)
    is FloatBetween -> setOf(field)
    is DateEquals -> setOf(field)
    is DateBetween -> setOf(field)
    is BooleanEquals -> setOf(field)
    is IsNull -> setOf(field)
    is LineageIn -> setOf(field)
    is SymbolEquals, is HasMutation, is InsertionContains -> emptySet()
}
