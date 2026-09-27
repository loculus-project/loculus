package org.loculus.backend.query.request

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.loculus.backend.query.filter.And
import org.loculus.backend.query.filter.BooleanEquals
import org.loculus.backend.query.filter.DateBetween
import org.loculus.backend.query.filter.Filter
import org.loculus.backend.query.filter.FloatBetween
import org.loculus.backend.query.filter.FloatEquals
import org.loculus.backend.query.filter.HasMutation
import org.loculus.backend.query.filter.InsertionContains
import org.loculus.backend.query.filter.IntBetween
import org.loculus.backend.query.filter.IntEquals
import org.loculus.backend.query.filter.IsNull
import org.loculus.backend.query.filter.LineageIn
import org.loculus.backend.query.filter.Maybe
import org.loculus.backend.query.filter.NOf
import org.loculus.backend.query.filter.Not
import org.loculus.backend.query.filter.Or
import org.loculus.backend.query.filter.StringEquals
import org.loculus.backend.query.filter.StringRegex
import org.loculus.backend.query.filter.SymbolEquals
import org.loculus.backend.query.request.TestSchemas.epochDay
import org.loculus.backend.query.schema.Alphabet

class AdvancedQueryParserTest {
    private val schema = TestSchemas.single
    private val nuc = Alphabet.NUCLEOTIDE
    private val aa = Alphabet.AMINO_ACID
    private val s = schema.gene("S")!!.index
    private val e = schema.gene("E")!!.index

    private fun parse(query: String, onSchema: org.loculus.backend.query.schema.QuerySchema = schema): Filter =
        AdvancedQueryParser.parse(onSchema, query)

    private fun error(query: String, onSchema: org.loculus.backend.query.schema.QuerySchema = schema): String =
        assertThrows<QueryBadRequestException> { AdvancedQueryParser.parse(onSchema, query) }.message!!

    private fun nt(position: Int, symbol: Char) = SymbolEquals(0, position, nuc.indexOf(symbol))

    private val usa = StringEquals("country", "USA")

    // ---- precedence and operators ----

    @Test
    fun `AND binds tighter than OR (LAPIS example)`() {
        assertThat(parse("21T & 22A | country=USA"), equalTo(Or(listOf(And(listOf(nt(21, 'T'), nt(22, 'A'))), usa))))
        assertThat(parse("21T | 22A & country=USA"), equalTo(Or(listOf(nt(21, 'T'), And(listOf(nt(22, 'A'), usa))))))
    }

    @Test
    fun `NOT binds tighter than AND`() {
        assertThat(parse("!21T & 22A"), equalTo(And(listOf(Not(nt(21, 'T')), nt(22, 'A')))))
        assertThat(parse("NOT 21T and 22A"), equalTo(And(listOf(Not(nt(21, 'T')), nt(22, 'A')))))
        assertThat(parse("not (21T or 22A)"), equalTo(Not(Or(listOf(nt(21, 'T'), nt(22, 'A'))))))
        assertThat(parse("!!21T"), equalTo(Not(Not(nt(21, 'T')))))
    }

    @Test
    fun `operators are left associative and flattened`() {
        assertThat(parse("21T & 22A & 23G"), equalTo(And(listOf(nt(21, 'T'), nt(22, 'A'), nt(23, 'G')))))
        assertThat(parse("21T | 22A | 23G"), equalTo(Or(listOf(nt(21, 'T'), nt(22, 'A'), nt(23, 'G')))))
    }

    @Test
    fun `parentheses override precedence`() {
        assertThat(parse("21T & (22A | country=USA)"), equalTo(And(listOf(nt(21, 'T'), Or(listOf(nt(22, 'A'), usa))))))
        assertThat(parse("((21T))"), equalTo(nt(21, 'T')))
    }

    @ParameterizedTest
    @ValueSource(strings = ["21T AND 22A", "21T and 22A", "21T aNd 22A", "21T&22A", "21T & 22A", "21t & 22a"])
    fun `AND keyword variants`(query: String) {
        assertThat(parse(query), equalTo(And(listOf(nt(21, 'T'), nt(22, 'A')))))
    }

    @ParameterizedTest
    @ValueSource(strings = ["21T OR 22A", "21T or 22A", "21T|22A", "21T | 22A"])
    fun `OR keyword variants`(query: String) {
        assertThat(parse(query), equalTo(Or(listOf(nt(21, 'T'), nt(22, 'A')))))
    }

    @ParameterizedTest
    @ValueSource(strings = ["21T and22A", "21Tand 22A", "21T AND", "not21T", "21T 22A", "& 21T", "(21T", "21T)", ""])
    fun `invalid operator usage is a parse error`(query: String) {
        assertThat(error(query), startsWith("Failed to parse advanced query (line 1:"))
    }

    @Test
    fun `parse error reports line and column`() {
        assertThat(
            error("date>2021-01-01"),
            equalTo("Failed to parse advanced query (line 1:15): no viable alternative at input 'date2021-01-01'."),
        )
        assertThat(error("21T &\n 22A &"), startsWith("Failed to parse advanced query (line 2:6): "))
        assertThat(error("(21T"), equalTo("Failed to parse advanced query (line 1:4): missing ')' at '<EOF>'."))
    }

    // ---- mutations ----

    @Test
    fun `unnamed nucleotide mutations`() {
        assertThat(parse("21T"), equalTo(nt(21, 'T')))
        assertThat(parse("C21T"), equalTo(nt(21, 'T')))
        assertThat(parse("21"), equalTo(HasMutation(0, 21)))
        assertThat(parse("21-"), equalTo(nt(21, '-')))
        assertThat(parse("21."), equalTo(nt(21, 'C')))
        assertThat(parse("21N"), equalTo(nt(21, 'N')))
        assertThat(parse("21 T"), equalTo(nt(21, 'T')))
    }

    @Test
    fun `named mutations resolve gene first then segment`() {
        assertThat(parse("S:5L"), equalTo(SymbolEquals(s, 5, aa.indexOf('L'))))
        assertThat(parse("s:F5*"), equalTo(SymbolEquals(s, 5, aa.indexOf('*'))))
        assertThat(parse("E:9"), equalTo(HasMutation(e, 9)))
        assertThat(parse("E:9."), equalTo(SymbolEquals(e, 9, aa.indexOf('T'))))
        assertThat(parse("main:21T"), equalTo(nt(21, 'T')))
        assertThat(parse("MAIN:21"), equalTo(HasMutation(0, 21)))
    }

    @Test
    fun `named mutation errors`() {
        assertThat(
            error("country:5"),
            equalTo("country is not a known segment or gene, known segments are [main], known genes are [S, E]"),
        )
        assertThat(error("main:21E"), equalTo("Invalid nucleotide symbol: E"))
        assertThat(
            error("main:0T"),
            equalTo("Error from SILO: The field 'position' is 1-indexed. Value of 0 not allowed."),
        )
        assertThat(
            error("S:99"),
            equalTo("Error from SILO: HasAminoAcidMutation position is out of bounds 99 > 10"),
        )
        assertThat(error("99T"), equalTo("Error from SILO: SymbolEquals<Nucleotide> position is out of bounds 99 > 30"))
    }

    @Test
    fun `unnamed mutations require a single segmented genome`() {
        assertThat(
            error("21T", TestSchemas.multi),
            equalTo("Reference genome is multi-segmented, you must specify segment as part of mutation query"),
        )
        assertThat(parse("M:3G", TestSchemas.multi), equalTo(SymbolEquals(1, 3, nuc.indexOf('G'))))
        assertThat(parse("gp:2", TestSchemas.multi), equalTo(HasMutation(TestSchemas.multi.gene("GP")!!.index, 2)))
    }

    // ---- insertions ----

    @Test
    fun `insertions`() {
        assertThat(parse("ins_10:TGTC"), equalTo(InsertionContains(0, 10, "TGTC")))
        assertThat(parse("ins_10:T?c"), equalTo(InsertionContains(0, 10, "T.*C")))
        assertThat(parse("INS_main:10:ACG"), equalTo(InsertionContains(0, 10, "ACG")))
        assertThat(parse("ins_S:5:EPE"), equalTo(InsertionContains(s, 5, "EPE")))
        assertThat(parse("ins_S:5:E*?"), equalTo(InsertionContains(s, 5, "E\\*.*")))
        assertThat(
            error("ins_99:A"),
            equalTo(
                "Error from SILO: the requested insertion position (99) is larger than the length of the " +
                    "reference sequence (30) for sequence 'main'",
            ),
        )
        assertThat(error("ins_foo:5:A"), equalTo("foo is not a known segment or gene"))
        assertThat(error("ins_main:5:E"), equalTo("Invalid nucleotide symbol: E"))
    }

    // ---- maybe and N-of ----

    @Test
    fun `maybe around variant expressions`() {
        assertThat(parse("maybe(21T)"), equalTo(Maybe(nt(21, 'T'))))
        assertThat(parse("MAYBE(21)"), equalTo(Maybe(HasMutation(0, 21))))
        assertThat(
            parse("maybe(21T & !S:5L) | country=USA"),
            equalTo(Or(listOf(Maybe(And(listOf(nt(21, 'T'), Not(SymbolEquals(s, 5, aa.indexOf('L')))))), usa))),
        )
        assertThat(parse("maybe(maybe(21T))"), equalTo(Maybe(Maybe(nt(21, 'T')))))
    }

    @ParameterizedTest
    @ValueSource(strings = ["maybe(country=USA)", "maybe(isNull(country))", "maybe(21T & country=USA)", "maybe 21T"])
    fun `maybe around metadata expressions is a parse error`(query: String) {
        assertThat(error(query), startsWith("Failed to parse advanced query (line 1:"))
    }

    @Test
    fun `n-of queries`() {
        assertThat(
            parse("[2-of: 21T, 22A, country=USA]"),
            equalTo(NOf(2, false, listOf(nt(21, 'T'), nt(22, 'A'), usa))),
        )
        assertThat(
            parse("[EXACTLY-2-OF: 21T, 22A | 23G]"),
            equalTo(NOf(2, true, listOf(nt(21, 'T'), Or(listOf(nt(22, 'A'), nt(23, 'G')))))),
        )
        assertThat(parse("[1 2-of: 21T]"), equalTo(NOf(12, false, listOf(nt(21, 'T')))))
        assertThat(parse("maybe([1-of: 21T])"), equalTo(Maybe(NOf(1, false, listOf(nt(21, 'T'))))))
        assertThat(error("[2of: 21T]"), startsWith("Failed to parse advanced query"))
    }

    // ---- metadata ----

    @Test
    fun `metadata equality`() {
        assertThat(parse("country=USA"), equalTo(usa))
        assertThat(parse("COUNTRY = USA"), equalTo(usa))
        assertThat(parse("age=5"), equalTo(IntEquals("age", 5)))
        assertThat(parse("qc=0.5"), equalTo(FloatEquals("qc", 0.5)))
        assertThat(parse("isRevocation=TRUE"), equalTo(BooleanEquals("isRevocation", true)))
        assertThat(
            parse("date=2021-01-01"),
            equalTo(DateBetween("date", epochDay("2021-01-01"), epochDay("2021-01-01"))),
        )
        assertThat(parse("country=Köln"), equalTo(StringEquals("country", "Köln")))
        assertThat(parse("country=a-b_c.d*1"), equalTo(StringEquals("country", "a-b_c.d*1")))
    }

    @Test
    fun `whitespace inside unquoted values is dropped`() {
        assertThat(parse("country=United Kingdom"), equalTo(StringEquals("country", "UnitedKingdom")))
    }

    @Test
    fun `quoted strings`() {
        assertThat(parse("country='United Kingdom'"), equalTo(StringEquals("country", "United Kingdom")))
        assertThat(parse("country='It\\'s'"), equalTo(StringEquals("country", "It's")))
        assertThat(parse("country='a\\\\b'"), equalTo(StringEquals("country", "a\\b")))
        assertThat(parse("country='a & b | c'"), equalTo(StringEquals("country", "a & b | c")))
        assertThat(parse("country=''"), equalTo(StringEquals("country", "")))
        assertThat(parse("country='21T'"), equalTo(StringEquals("country", "21T")))
    }

    @Test
    fun `metadata names that look like mutations`() {
        // "21T" followed by '=' is a metadata query on field "21T" -> unknown field
        assertThat(error("21T=5"), startsWith("Metadata field 21T does not exist."))
        assertThat(error("S=5"), startsWith("Metadata field S does not exist."))
        assertThat(error("ins_5=5"), startsWith("Metadata field ins_5 does not exist."))
    }

    @Test
    fun `range queries`() {
        assertThat(parse("date >= 2021-01-01"), equalTo(DateBetween("date", epochDay("2021-01-01"), null)))
        assertThat(parse("date<=2021-01-01"), equalTo(DateBetween("date", null, epochDay("2021-01-01"))))
        assertThat(parse("age>=5"), equalTo(IntBetween("age", 5, null)))
        assertThat(parse("qc<=0.5"), equalTo(FloatBetween("qc", null, 0.5)))
        assertThat(error("country>=x"), equalTo("expression >= cannot be used for field country of type STRING"))
        assertThat(error("age>=x"), equalTo("'x' is not a valid integer"))
        assertThat(error("qc<=x"), equalTo("'x' is not a valid float"))
        assertThat(error("date>=2021-1-1"), startsWith("'2021-1-1' is not a valid date: Text '2021-1-1' could not"))
    }

    @Test
    fun `regex and isNull`() {
        assertThat(parse("country.regex='^U.*'"), equalTo(StringRegex("country", "^U.*")))
        assertThat(parse("Country.REGEX=USA"), equalTo(StringRegex("country", "USA")))
        assertThat(
            error("age.regex='1'"),
            equalTo("Metadata field 'age' of type INT does not support regex search. Only string fields do."),
        )
        assertThat(error("country.regex='('"), startsWith("Error from SILO: Invalid Regular Expression."))
        assertThat(parse("isNull(country)"), equalTo(StringEquals("country", null)))
        assertThat(parse("ISNULL(date)"), equalTo(IsNull("date")))
        assertThat(parse("isnull(age)"), equalTo(IntEquals("age", null)))
        assertThat(parse("isNull(qc)"), equalTo(FloatEquals("qc", null)))
        assertThat(parse("isNull(isRevocation)"), equalTo(BooleanEquals("isRevocation", null)))
        assertThat(parse("isNull(pangoLineage)"), equalTo(LineageIn("pangoLineage", null)))
    }

    @Test
    fun `metadata errors`() {
        assertThat(
            error("foo=bar"),
            equalTo(
                "Metadata field foo does not exist. Known fields: accessionversion, country, date, age, qc, " +
                    "isrevocation, pangolineage, versionstatus.",
            ),
        )
        assertThat(error("isRevocation=yes"), equalTo("'yes' is not a valid boolean"))
        assertThat(error("age=1.5"), equalTo("'1.5' is not a valid integer"))
        assertThat(error("country>5"), startsWith("Failed to parse advanced query (line 1:9): no viable alternative"))
    }

    @Test
    fun `semantic errors only after a successful parse`() {
        assertThat(error("foo=bar &"), startsWith("Failed to parse advanced query"))
    }

    // ---- lineages ----

    @Test
    fun `lineage queries`() {
        assertThat(parse("pangoLineage=B.1.1.7"), equalTo(LineageIn("pangoLineage", setOf("B.1.1.7"))))
        assertThat(parse("pangoLineage=B.1.1.7*"), equalTo(LineageIn("pangoLineage", setOf("B.1.1.7"))))
        assertThat(
            parse("pangoLineage=BA.1.*"),
            equalTo(LineageIn("pangoLineage", setOf("B.1.1.529.1", "BA.1.1"))),
        )
        assertThat(
            error("pangoLineage=B.1."),
            equalTo("Invalid lineage: B.1. must not end with a dot. Did you mean 'B.1.*'?"),
        )
        assertThat(
            error("pangoLineage=''"),
            equalTo("Invalid lineage:  is NULL - to search for NULL values use `IsNull(pangoLineage)`?"),
        )
        assertThat(
            error("pangoLineage=b.1.1.7"),
            equalTo("Error from SILO: The lineage 'b.1.1.7' is not a valid lineage for column 'pangoLineage'."),
        )
    }

    @Test
    fun `complex query`() {
        val filter = parse(
            "(country='United Kingdom' | country=USA) & date >= 2021-01-01 & !isNull(age) & " +
                "[2-of: S:5L, 21T, maybe(ins_10:A?)]",
        )
        assertThat(filter.toString(), containsString("NOf(n=2"))
        assertThat((filter as And).children.size, equalTo(4))
    }
}
