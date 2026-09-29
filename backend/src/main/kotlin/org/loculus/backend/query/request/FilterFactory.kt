package org.loculus.backend.query.request

import com.google.re2j.Pattern
import com.google.re2j.PatternSyntaxException
import org.loculus.backend.query.filter.And
import org.loculus.backend.query.filter.Filter
import org.loculus.backend.query.filter.HasMutation
import org.loculus.backend.query.filter.InsertionContains
import org.loculus.backend.query.filter.LineageIn
import org.loculus.backend.query.filter.Or
import org.loculus.backend.query.filter.StringRegex
import org.loculus.backend.query.filter.SymbolEquals
import org.loculus.backend.query.filter.True
import org.loculus.backend.query.schema.MetadataField
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.schema.SequenceSchema
import org.loculus.backend.query.schema.SequenceType

internal const val SILO_ERROR_PREFIX = "Error from SILO: "

internal fun badRequest(message: String): Nothing = throw QueryBadRequestException(message)

internal fun siloError(message: String): Nothing = throw QueryBadRequestException(SILO_ERROR_PREFIX + message)

/**
 * Builds sequence / lineage / regex filters including the validations SILO performs when it compiles
 * the query (error texts as in SILO v0.14.3, prefixed with "Error from SILO: " like LAPIS does).
 */
internal object FilterFactory {
    private fun symbolName(sequence: SequenceSchema) =
        if (sequence.type == SequenceType.NUCLEOTIDE) "Nucleotide" else "AminoAcid"

    private fun equalsFunctionName(sequence: SequenceSchema) =
        if (sequence.type == SequenceType.NUCLEOTIDE) "nucleotideEquals" else "aminoAcidEquals"

    private fun checkPositionNotZero(position: Int) {
        if (position <= 0) siloError("The field 'position' is 1-indexed. Value of 0 not allowed.")
    }

    /** [symbol] null = "has mutation"; '.' = reference symbol */
    fun mutation(sequence: SequenceSchema, position: Int, symbol: Char?): Filter {
        checkPositionNotZero(position)
        if (symbol == null) {
            if (position > sequence.length) {
                siloError(
                    "Has${symbolName(sequence)}Mutation position is out of bounds $position > ${sequence.length}",
                )
            }
            return HasMutation(sequence.index, position)
        }
        val symbolIndex = if (symbol == '.') {
            null
        } else {
            val normalized = if (sequence.type == SequenceType.NUCLEOTIDE && symbol.uppercaseChar() == 'U') {
                'T'
            } else {
                symbol
            }
            sequence.alphabet.indexOf(normalized).takeIf { it >= 0 }
                ?: siloError("${equalsFunctionName(sequence)}() invalid symbol '$symbol'")
        }
        if (position > sequence.length) {
            siloError(
                "SymbolEquals<${symbolName(sequence)}> position is out of bounds $position > ${sequence.length}",
            )
        }
        return SymbolEquals(sequence.index, position, symbolIndex ?: sequence.referenceSymbolIndex(position))
    }

    /** [regex] already translated to RE2 syntax */
    fun insertion(sequence: SequenceSchema, position: Int, regex: String): Filter {
        if (regex.isEmpty()) {
            siloError("The field 'value' in an InsertionContains expression must not be an empty string")
        }
        if (position > sequence.length) {
            siloError(
                "the requested insertion position ($position) is larger than the length of the reference " +
                    "sequence (${sequence.length}) for sequence '${sequence.name}'",
            )
        }
        try {
            Pattern.compile(regex)
        } catch (e: PatternSyntaxException) {
            siloError("Invalid insertion regex '$regex': ${e.description}")
        }
        return InsertionContains(sequence.index, position, regex)
    }

    fun regex(field: MetadataField, pattern: String): Filter {
        try {
            Pattern.compile(pattern)
        } catch (e: PatternSyntaxException) {
            siloError(
                "Invalid Regular Expression. The parsing of the regular expression failed with the error " +
                    "'${e.description}: ${e.pattern}'. See https://github.com/google/re2/wiki/Syntax " +
                    "for a Syntax specification.",
            )
        }
        return StringRegex(field.name, pattern)
    }

    /** [lineage] null = is null */
    fun lineage(schema: QuerySchema, field: MetadataField, lineage: String?, includeSublineages: Boolean): Filter {
        if (lineage == null) return LineageIn(field.name, null)
        val definition = field.lineageSystem?.let { schema.lineageDefinitions[it] }
        if (definition == null || !definition.contains(lineage)) {
            siloError("The lineage '$lineage' is not a valid lineage for column '${field.name}'.")
        }
        return LineageIn(field.name, definition.resolve(lineage, includeSublineages))
    }

    /** insertion symbols -> RE2: '?' -> '.*', aa '*' -> '\*', upper-cased */
    fun translateInsertion(symbols: String, aminoAcid: Boolean): String {
        val escaped = if (aminoAcid) symbols.replace("*", "\\*") else symbols
        return escaped.replace("?", ".*").uppercase()
    }
}

internal fun and(children: List<Filter>): Filter {
    val flat = children.flatMap { if (it is And) it.children else listOf(it) }.filter { it != True }
    return when (flat.size) {
        0 -> True
        1 -> flat.single()
        else -> And(flat)
    }
}

internal fun or(children: List<Filter>): Filter {
    val flat = children.flatMap { if (it is Or) it.children else listOf(it) }
    return if (flat.size == 1) flat.single() else Or(flat)
}
