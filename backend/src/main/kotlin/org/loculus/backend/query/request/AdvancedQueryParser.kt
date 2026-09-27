package org.loculus.backend.query.request

import org.loculus.backend.query.filter.BooleanEquals
import org.loculus.backend.query.filter.DateBetween
import org.loculus.backend.query.filter.Filter
import org.loculus.backend.query.filter.FloatBetween
import org.loculus.backend.query.filter.FloatEquals
import org.loculus.backend.query.filter.IntBetween
import org.loculus.backend.query.filter.IntEquals
import org.loculus.backend.query.filter.IsNull
import org.loculus.backend.query.filter.Maybe
import org.loculus.backend.query.filter.NOf
import org.loculus.backend.query.filter.Not
import org.loculus.backend.query.filter.StringEquals
import org.loculus.backend.query.schema.FieldType
import org.loculus.backend.query.schema.MetadataField
import org.loculus.backend.query.schema.QuerySchema
import java.time.LocalDate
import java.time.format.DateTimeParseException

/**
 * Parser for the LAPIS `advancedQuery` language, reproducing the ANTLR grammar AdvancedQuery.g4 of LAPIS v0.8.8
 * (lexer quirks included: keywords AND/OR carry their surrounding spaces, `NOT ` its trailing space, whitespace is
 * skipped everywhere outside quoted strings, unrecognised characters are silently dropped like ANTLR's default
 * lexer error recovery does).
 *
 * Like LAPIS, the whole query is first parsed syntactically (syntax errors win), then converted to a [Filter]
 * left to right (semantic errors such as unknown fields are reported for the first offending expression).
 */
object AdvancedQueryParser {
    fun parse(schema: QuerySchema, query: String): Filter {
        val tokens = AdvancedQueryLexer.tokenize(query)
        val ast = AqSyntaxParser(tokens).parseStart()
        return AqConverter(schema).convert(ast)
    }
}

// ------------------------------------------------------------------------------------------------
// lexer

internal enum class TokenType {
    LETTER,
    NUMBER,
    MINUS,
    UNDERSCORE,
    DOT,
    ASTERISK,
    UNICODE_LETTER,
    QUOTED_STRING,
    AND,
    OR,
    NOT,
    LPAREN,
    RPAREN,
    LBRACKET,
    RBRACKET,
    COMMA,
    COLON,
    EQUALS,
    GTE,
    LTE,
    AMPERSAND,
    PIPE,
    BANG,
    QUESTION_MARK,
    EOF,
}

internal data class Token(val type: TokenType, val text: String, val line: Int, val column: Int) {
    /** for LETTER tokens: the upper-cased letter */
    val letter: Char get() = text[0].uppercaseChar()

    fun isLetter(c: Char) = type == TokenType.LETTER && letter == c

    val displayText: String get() = if (type == TokenType.EOF) "<EOF>" else text
}

internal object AdvancedQueryLexer {
    private val SINGLE_CHAR_TOKENS = mapOf(
        '-' to TokenType.MINUS,
        '_' to TokenType.UNDERSCORE,
        '.' to TokenType.DOT,
        '*' to TokenType.ASTERISK,
        '(' to TokenType.LPAREN,
        ')' to TokenType.RPAREN,
        '[' to TokenType.LBRACKET,
        ']' to TokenType.RBRACKET,
        ',' to TokenType.COMMA,
        ':' to TokenType.COLON,
        '=' to TokenType.EQUALS,
        '&' to TokenType.AMPERSAND,
        '|' to TokenType.PIPE,
        '!' to TokenType.BANG,
        '?' to TokenType.QUESTION_MARK,
    )

    fun tokenize(input: String): List<Token> {
        val cps = input.codePoints().toArray()
        val tokens = mutableListOf<Token>()
        var i = 0
        var line = 1
        var column = 0

        fun matchesIgnoreCase(at: Int, text: String): Boolean {
            if (at + text.length > cps.size) return false
            return text.indices.all { k ->
                val cp = cps[at + k]
                cp < 128 && cp.toChar().lowercaseChar() == text[k]
            }
        }

        fun textOf(from: Int, to: Int) = String(cps, from, to - from)

        fun advance(length: Int) {
            for (k in i until i + length) {
                if (cps[k] == '\n'.code) {
                    line++
                    column = 0
                } else {
                    column++
                }
            }
            i += length
        }

        fun emit(type: TokenType, length: Int) {
            tokens.add(Token(type, textOf(i, i + length), line, column))
            advance(length)
        }

        fun skip() = advance(1)

        while (i < cps.size) {
            val cp = cps[i]
            val c = if (cp < 0x10000) cp.toChar() else '\u0000'
            when {
                cp == ' '.code -> when {
                    matchesIgnoreCase(i, " and ") -> emit(TokenType.AND, 5)
                    matchesIgnoreCase(i, " or ") -> emit(TokenType.OR, 4)
                    else -> skip()
                }

                cp == '\t'.code || cp == '\r'.code || cp == '\n'.code -> skip()

                matchesIgnoreCase(i, "not ") -> emit(TokenType.NOT, 4)

                cp < 128 && c.isLetter() -> emit(TokenType.LETTER, 1)

                cp < 128 && c.isDigit() -> {
                    var j = i
                    while (j < cps.size && cps[j] < 128 && cps[j].toChar().isDigit()) j++
                    emit(TokenType.NUMBER, j - i)
                }

                cp == '\''.code -> {
                    var j = i + 1
                    var terminated = false
                    while (j < cps.size) {
                        when (cps[j]) {
                            '\\'.code -> {
                                if (j + 1 >= cps.size) break
                                j += 2
                            }

                            '\''.code -> {
                                terminated = true
                                break
                            }

                            else -> j++
                        }
                    }
                    if (terminated) emit(TokenType.QUOTED_STRING, j - i + 1) else skip()
                }

                cp == '>'.code || cp == '<'.code -> {
                    if (i + 1 < cps.size && cps[i + 1] == '='.code) {
                        emit(if (cp == '>'.code) TokenType.GTE else TokenType.LTE, 2)
                    } else {
                        skip()
                    }
                }

                cp < 128 && SINGLE_CHAR_TOKENS.containsKey(c) -> emit(SINGLE_CHAR_TOKENS.getValue(c), 1)

                isUnicodeLetterOrMark(cp) -> emit(TokenType.UNICODE_LETTER, 1)

                // ANTLR's default lexer error handling: report (to the console) and drop the character
                else -> skip()
            }
        }
        tokens.add(Token(TokenType.EOF, "", line, column))
        return tokens
    }

    private fun isUnicodeLetterOrMark(cp: Int): Boolean {
        if (Character.isLetter(cp)) return true
        return when (Character.getType(cp).toByte()) {
            Character.NON_SPACING_MARK, Character.ENCLOSING_MARK, Character.COMBINING_SPACING_MARK -> true
            else -> false
        }
    }
}

// ------------------------------------------------------------------------------------------------
// syntax tree

internal sealed interface AqNode

internal data class AqAnd(val left: AqNode, val right: AqNode) : AqNode

internal data class AqOr(val left: AqNode, val right: AqNode) : AqNode

internal data class AqNot(val child: AqNode) : AqNode

internal data class AqMaybe(val child: AqNode) : AqNode

internal data class AqNOf(val n: String, val exactly: Boolean, val children: List<AqNode>) : AqNode

internal data class AqSingleSegmentedMutation(val position: String, val secondSymbol: String?) : AqNode

internal data class AqNucleotideInsertion(val position: String, val symbols: List<String>) : AqNode

internal data class AqNamedMutation(val name: String, val position: String, val secondSymbol: String?) : AqNode

internal data class AqNamedInsertion(val name: String, val position: String, val symbols: List<String>) : AqNode

internal data class AqMetadata(val name: String, val value: String) : AqNode

internal data class AqGreaterThanEqual(val name: String, val value: String) : AqNode

internal data class AqLessThanEqual(val name: String, val value: String) : AqNode

internal data class AqIsNull(val name: String) : AqNode

// ------------------------------------------------------------------------------------------------
// parser

private class AqSyntaxError(val token: Token, message: String) : RuntimeException(message)

private const val NUCLEOTIDE_SYMBOLS = "ACGTMRWSYKVHDBN"
private const val AMINO_ACID_SYMBOLS = "ARNDCEQGHILKMFPSTWYVBZX"
private const val MUTATION_SYMBOLS = NUCLEOTIDE_SYMBOLS + AMINO_ACID_SYMBOLS

private val FOLLOW_OF_ATOM = setOf(
    TokenType.AND,
    TokenType.AMPERSAND,
    TokenType.OR,
    TokenType.PIPE,
    TokenType.RPAREN,
    TokenType.COMMA,
    TokenType.RBRACKET,
    TokenType.EOF,
)

private val NAME_TOKENS = setOf(
    TokenType.LETTER,
    TokenType.NUMBER,
    TokenType.MINUS,
    TokenType.UNDERSCORE,
    TokenType.DOT,
    TokenType.ASTERISK,
    TokenType.UNICODE_LETTER,
)

/**
 * Recursive descent parser for the grammar. Operator precedence NOT > AND > OR, left associative (ANTLR left
 * recursion). The only real ambiguity - which of the "atomic" alternatives (mutation, insertion, metadata
 * expression) applies - is resolved by trying the alternatives in grammar order and taking the first that
 * parses and is followed by a token that may follow an atom, which is how ANTLR's adaptive prediction
 * resolves it for this grammar.
 */
internal class AqSyntaxParser(private val tokens: List<Token>) {
    private var pos = 0

    private val la: Token get() = tokens[pos]

    private fun la(k: Int): Token = tokens[minOf(pos + k - 1, tokens.size - 1)]

    fun parseStart(): AqNode = try {
        val expr = parseOr(variant = false)
        if (la.type != TokenType.EOF) {
            val kind = if (la(2).type == TokenType.EOF) "extraneous" else "mismatched"
            throw AqSyntaxError(la, "$kind input '${la.displayText}' expecting {<EOF>, '|', '&', AND, OR}")
        }
        expr
    } catch (e: AqSyntaxError) {
        throw QueryBadRequestException(
            "Failed to parse advanced query (line ${e.token.line}:${e.token.column}): ${e.message}.",
        )
    }

    private fun isOr() = la.type == TokenType.OR || la.type == TokenType.PIPE

    private fun isAnd() = la.type == TokenType.AND || la.type == TokenType.AMPERSAND

    private fun isNot() = la.type == TokenType.NOT || la.type == TokenType.BANG

    private fun parseOr(variant: Boolean): AqNode {
        var left = parseAnd(variant)
        while (isOr()) {
            pos++
            left = AqOr(left, parseAnd(variant))
        }
        return left
    }

    private fun parseAnd(variant: Boolean): AqNode {
        var left = parseUnary(variant)
        while (isAnd()) {
            pos++
            left = AqAnd(left, parseUnary(variant))
        }
        return left
    }

    private fun parseUnary(variant: Boolean): AqNode {
        if (isNot()) {
            pos++
            return AqNot(parseUnary(variant))
        }
        return parsePrimary(variant)
    }

    private fun isMaybeKeyword(): Boolean = "MAYBE".withIndex().all { (k, c) -> la(k + 1).isLetter(c) } &&
        la(6).type == TokenType.LPAREN

    private fun parsePrimary(variant: Boolean): AqNode {
        when {
            la.type == TokenType.LPAREN -> {
                pos++
                val inner = parseOr(variant)
                expect(TokenType.RPAREN, "')'")
                return inner
            }

            isMaybeKeyword() -> {
                pos += 6
                val inner = parseOr(variant = true)
                expect(TokenType.RPAREN, "')'")
                return AqMaybe(inner)
            }

            la.type == TokenType.LBRACKET -> return parseNOf()
        }
        return parseAtom(variant)
    }

    private fun expect(type: TokenType, display: String): Token {
        val token = la
        if (token.type == type) {
            pos++
            return token
        }
        val message = when {
            la(2).type == type -> "extraneous input '${token.displayText}' expecting $display"
            token.type in FOLLOW_OF_ATOM -> "missing $display at '${token.displayText}'"
            else -> "mismatched input '${token.displayText}' expecting $display"
        }
        throw AqSyntaxError(token, message)
    }

    private fun expectLetter(c: Char) {
        if (la.isLetter(c)) {
            pos++
            return
        }
        throw AqSyntaxError(la, "mismatched input '${la.displayText}' expecting '$c'")
    }

    private fun parseNOf(): AqNode {
        expect(TokenType.LBRACKET, "'['")
        var exactly = false
        if (la.type == TokenType.LETTER) {
            "EXACTLY".forEach { expectLetter(it) }
            expect(TokenType.MINUS, "'-'")
            exactly = true
        }
        if (la.type != TokenType.NUMBER) {
            throw AqSyntaxError(la, "mismatched input '${la.displayText}' expecting NUMBER")
        }
        val n = StringBuilder()
        while (la.type == TokenType.NUMBER) n.append(tokens[pos++].text)
        expect(TokenType.MINUS, "'-'")
        expectLetter('O')
        expectLetter('F')
        expect(TokenType.COLON, "':'")
        val children = mutableListOf(parseOr(variant = false))
        while (la.type == TokenType.COMMA) {
            pos++
            children.add(parseOr(variant = false))
        }
        expect(TokenType.RBRACKET, "']'")
        return AqNOf(n.toString(), exactly, children)
    }

    // ---- atoms (backtracking over the alternatives) ----

    private class AtomFailure(val index: Int) : RuntimeException(null, null, false, false)

    private inner class Cursor(var index: Int) {
        val token: Token get() = tokens[minOf(index, tokens.size - 1)]

        fun fail(): Nothing = throw AtomFailure(index)

        fun next(): Token = token.also { index++ }

        fun take(type: TokenType): Token = if (token.type == type) next() else fail()

        fun takeLetter(c: Char) = if (token.isLetter(c)) next() else fail()

        fun takeKeyword(word: String) = word.forEach { takeLetter(it) }

        fun name(): String {
            if (token.type !in NAME_TOKENS) fail()
            val sb = StringBuilder()
            while (token.type in NAME_TOKENS) sb.append(next().text)
            return sb.toString()
        }

        fun isSymbol(symbols: String) = token.type == TokenType.LETTER && token.letter in symbols

        fun symbols(allowed: String, allowAsterisk: Boolean): List<String> {
            val result = mutableListOf<String>()
            while (isSymbol(allowed) ||
                token.type == TokenType.QUESTION_MARK ||
                (allowAsterisk && token.type == TokenType.ASTERISK)
            ) {
                result.add(next().text)
            }
            if (result.isEmpty()) fail()
            return result
        }
    }

    private fun singleSegmentedMutation(c: Cursor): AqNode {
        if (c.isSymbol(NUCLEOTIDE_SYMBOLS)) c.next()
        val position = c.take(TokenType.NUMBER).text
        val second = when {
            c.isSymbol(NUCLEOTIDE_SYMBOLS) || c.token.type == TokenType.MINUS || c.token.type == TokenType.DOT ->
                c.next().text

            else -> null
        }
        return AqSingleSegmentedMutation(position, second)
    }

    private fun insertionKeyword(c: Cursor) {
        c.takeKeyword("INS")
        c.take(TokenType.UNDERSCORE)
    }

    private fun nucleotideInsertion(c: Cursor): AqNode {
        insertionKeyword(c)
        val position = c.take(TokenType.NUMBER).text
        c.take(TokenType.COLON)
        return AqNucleotideInsertion(position, c.symbols(NUCLEOTIDE_SYMBOLS, allowAsterisk = false))
    }

    private fun namedMutation(c: Cursor): AqNode {
        val name = c.name()
        c.take(TokenType.COLON)
        if (c.isSymbol(MUTATION_SYMBOLS) || c.token.type == TokenType.ASTERISK) c.next()
        val position = c.take(TokenType.NUMBER).text
        val second = when {
            c.isSymbol(MUTATION_SYMBOLS) ||
                c.token.type == TokenType.ASTERISK ||
                c.token.type == TokenType.MINUS ||
                c.token.type == TokenType.DOT -> c.next().text

            else -> null
        }
        return AqNamedMutation(name, position, second)
    }

    private fun namedInsertion(c: Cursor): AqNode {
        insertionKeyword(c)
        val name = c.name()
        c.take(TokenType.COLON)
        val position = c.take(TokenType.NUMBER).text
        c.take(TokenType.COLON)
        return AqNamedInsertion(name, position, c.symbols(MUTATION_SYMBOLS, allowAsterisk = true))
    }

    private fun metadataQuery(c: Cursor): AqNode {
        val name = c.name()
        c.take(TokenType.EQUALS)
        val value = if (c.token.type == TokenType.QUOTED_STRING) c.next().text else c.name()
        return AqMetadata(name, value)
    }

    private fun greaterThanEqual(c: Cursor): AqNode {
        val name = c.name()
        c.take(TokenType.GTE)
        return AqGreaterThanEqual(name, c.name())
    }

    private fun lessThanEqual(c: Cursor): AqNode {
        val name = c.name()
        c.take(TokenType.LTE)
        return AqLessThanEqual(name, c.name())
    }

    private fun isNullQuery(c: Cursor): AqNode {
        c.takeKeyword("ISNULL")
        c.take(TokenType.LPAREN)
        val name = c.name()
        c.take(TokenType.RPAREN)
        return AqIsNull(name)
    }

    private val variantAlternatives: List<(Cursor) -> AqNode> = listOf(
        ::singleSegmentedMutation,
        ::nucleotideInsertion,
        ::namedMutation,
        ::namedInsertion,
    )

    private val allAlternatives: List<(Cursor) -> AqNode> = variantAlternatives + listOf(
        ::metadataQuery,
        ::greaterThanEqual,
        ::lessThanEqual,
        ::isNullQuery,
    )

    private fun parseAtom(variant: Boolean): AqNode {
        val start = pos
        var firstLocalSuccess: Pair<AqNode, Int>? = null
        var furthestFailure = start
        var failuresAtFurthest = 0
        for (alternative in if (variant) variantAlternatives else allAlternatives) {
            val cursor = Cursor(start)
            try {
                val node = alternative(cursor)
                if (tokens[cursor.index].type in FOLLOW_OF_ATOM) {
                    pos = cursor.index
                    return node
                }
                if (firstLocalSuccess == null) firstLocalSuccess = node to cursor.index
            } catch (e: AtomFailure) {
                when {
                    e.index > furthestFailure -> {
                        furthestFailure = e.index
                        failuresAtFurthest = 1
                    }

                    e.index == furthestFailure -> failuresAtFurthest++
                }
            }
        }
        firstLocalSuccess?.let { (node, end) ->
            pos = end
            return node
        }
        val offending = tokens[minOf(furthestFailure, tokens.size - 1)]
        val consumedText = tokens.subList(start, minOf(furthestFailure + 1, tokens.size))
            .filter { it.type != TokenType.EOF }
            .joinToString("") { it.text }
        throw AqSyntaxError(offending, "no viable alternative at input '${escape(consumedText)}'")
    }

    private fun escape(text: String) = text.replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t")
}

// ------------------------------------------------------------------------------------------------
// conversion to the filter AST (mirrors AdvancedQueryCustomListener of LAPIS v0.8.8)

private val ESCAPE_SEQUENCE_REGEX = Regex("""\\(.)""")

internal class AqConverter(private val schema: QuerySchema) {
    fun convert(node: AqNode): Filter = when (node) {
        is AqAnd -> and(listOf(convert(node.left), convert(node.right)))

        is AqOr -> or(listOf(convert(node.left), convert(node.right)))

        is AqNot -> Not(convert(node.child))

        is AqMaybe -> Maybe(convert(node.child))

        is AqNOf -> {
            val n = node.n.toIntOrNull() ?: badRequest("Invalid number of matchers in N-of query: ${node.n}")
            NOf(n, node.exactly, node.children.map { convert(it) })
        }

        is AqSingleSegmentedMutation -> {
            val sequence = schema.defaultNucleotideSequence ?: badRequest(
                "Reference genome is multi-segmented, you must specify segment as part of mutation query",
            )
            FilterFactory.mutation(sequence, position(node.position), node.secondSymbol?.uppercase()?.single())
        }

        is AqNucleotideInsertion -> {
            val sequence = schema.defaultNucleotideSequence ?: badRequest(
                "Reference genome is multi-segmented, you must specify segment as part of mutation query",
            )
            FilterFactory.insertion(sequence, position(node.position), insertionRegex(node.symbols))
        }

        is AqNamedMutation -> namedMutation(node)

        is AqNamedInsertion -> namedInsertion(node)

        is AqMetadata -> metadata(node)

        is AqGreaterThanEqual -> range(node.name, node.value, ">=")

        is AqLessThanEqual -> range(node.name, node.value, "<=")

        is AqIsNull -> isNull(node.name)
    }

    private fun position(text: String): Int = text.toIntOrNull() ?: badRequest("Invalid position: $text")

    private fun insertionRegex(symbols: List<String>) = symbols.joinToString("") {
        when (it) {
            "*" -> "\\*"
            "?" -> ".*"
            else -> it
        }.uppercase()
    }

    private fun namedMutation(node: AqNamedMutation): Filter {
        val symbol = node.secondSymbol?.uppercase()?.single()
        schema.gene(node.name)?.let { gene ->
            return FilterFactory.mutation(gene, position(node.position), symbol)
        }
        schema.nucleotideSequence(node.name)?.let { segment ->
            node.secondSymbol?.first()?.let { validateNucleotideSymbol(it) }
            return FilterFactory.mutation(segment, position(node.position), symbol)
        }
        badRequest(
            "${node.name} is not a known segment or gene, " +
                "known segments are ${schema.nucleotideSequences.map { it.name }}, " +
                "known genes are ${schema.genes.map { it.name }}",
        )
    }

    private fun namedInsertion(node: AqNamedInsertion): Filter {
        schema.gene(node.name)?.let { gene ->
            return FilterFactory.insertion(gene, position(node.position), insertionRegex(node.symbols))
        }
        schema.nucleotideSequence(node.name)?.let { segment ->
            node.symbols.forEach { symbol -> symbol.forEach { validateNucleotideSymbol(it) } }
            return FilterFactory.insertion(segment, position(node.position), insertionRegex(node.symbols))
        }
        badRequest("${node.name} is not a known segment or gene")
    }

    private fun validateNucleotideSymbol(c: Char) {
        if (c.uppercaseChar() !in "ACGTMRWSYKVHDBN-.?") badRequest("Invalid nucleotide symbol: $c")
    }

    private fun field(name: String): MetadataField = schema.field(name) ?: badRequest(
        "Metadata field $name does not exist. " +
            "Known fields: ${schema.metadata.joinToString(", ") { it.name.lowercase() }}.",
    )

    private fun metadata(node: AqMetadata): Filter {
        val name = node.name
        val value = node.value.trim('\'').replace(ESCAPE_SEQUENCE_REGEX, "$1")

        if (name.endsWith(".regex", ignoreCase = true)) {
            val field = field(name.substringBeforeLast("."))
            if (field.type != FieldType.STRING) {
                badRequest(
                    "Metadata field '${field.name}' of type ${field.type} does not support regex search. " +
                        "Only string fields do.",
                )
            }
            return FilterFactory.regex(field, value)
        }
        if (name.endsWith(".PhyloDescendantOf", ignoreCase = true)) {
            val field = field(name.substringBeforeLast("."))
            badRequest(
                "Metadata field '${field.name}' of type ${field.type} does not support PhyloDescendantOf queries. ",
            )
        }

        val field = field(name)
        return when (field.type) {
            FieldType.STRING -> if (field.lineageSystem == null) {
                StringEquals(field.name, value)
            } else {
                lineage(field, value)
            }

            FieldType.BOOLEAN -> BooleanEquals(field.name, parseBoolean(value))

            FieldType.DATE -> parseDate(value).let { DateBetween(field.name, it, it) }

            FieldType.FLOAT -> FloatEquals(field.name, parseFloat(value))

            FieldType.INT -> IntEquals(field.name, parseInt(value))
        }
    }

    private fun lineage(field: MetadataField, value: String): Filter = when {
        value.isBlank() -> badRequest(
            "Invalid lineage: $value is NULL - to search for NULL values use `IsNull(${field.name})`?",
        )

        value.endsWith(".*") -> FilterFactory.lineage(schema, field, value.substringBeforeLast(".*"), true)

        value.endsWith("*") -> FilterFactory.lineage(schema, field, value.substringBeforeLast("*"), true)

        value.endsWith('.') -> badRequest(
            "Invalid lineage: $value must not end with a dot. Did you mean '$value*'?",
        )

        else -> FilterFactory.lineage(schema, field, value, false)
    }

    private fun range(name: String, value: String, operator: String): Filter {
        val field = field(name)
        val isFrom = operator == ">="
        return when (field.type) {
            FieldType.DATE -> parseDate(value).let {
                if (isFrom) DateBetween(field.name, it, null) else DateBetween(field.name, null, it)
            }

            FieldType.FLOAT -> parseFloat(value).let {
                if (isFrom) FloatBetween(field.name, it, null) else FloatBetween(field.name, null, it)
            }

            FieldType.INT -> parseInt(value).let {
                if (isFrom) IntBetween(field.name, it, null) else IntBetween(field.name, null, it)
            }

            else -> badRequest("expression $operator cannot be used for field ${field.name} of type ${field.type}")
        }
    }

    private fun isNull(name: String): Filter {
        val field = field(name)
        return when (field.type) {
            FieldType.STRING -> if (field.lineageSystem == null) {
                StringEquals(field.name, null)
            } else {
                FilterFactory.lineage(schema, field, null, false)
            }

            FieldType.BOOLEAN -> BooleanEquals(field.name, null)

            FieldType.DATE -> IsNull(field.name)

            FieldType.FLOAT -> FloatEquals(field.name, null)

            FieldType.INT -> IntEquals(field.name, null)
        }
    }

    private fun parseBoolean(value: String): Boolean = value.lowercase().toBooleanStrictOrNull()
        ?: badRequest("'$value' is not a valid boolean")

    private fun parseDate(value: String): Int = try {
        LocalDate.parse(value).toEpochDay().toInt()
    } catch (e: DateTimeParseException) {
        badRequest("'$value' is not a valid date: ${e.message}")
    }

    private fun parseFloat(value: String): Double = try {
        value.toDouble()
    } catch (_: NumberFormatException) {
        badRequest("'$value' is not a valid float")
    }

    private fun parseInt(value: String): Long = value.toIntOrNull()?.toLong()
        ?: badRequest("'$value' is not a valid integer")
}
