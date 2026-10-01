package org.loculus.backend.query.request

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.nullValue
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
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
import org.loculus.backend.query.filter.Not
import org.loculus.backend.query.filter.Or
import org.loculus.backend.query.filter.StringEquals
import org.loculus.backend.query.filter.StringRegex
import org.loculus.backend.query.filter.SymbolEquals
import org.loculus.backend.query.filter.True
import org.loculus.backend.query.request.TestSchemas.epochDay
import org.loculus.backend.query.schema.Alphabet
import org.loculus.backend.query.schema.QuerySchema

class LapisRequestParserTest {
    private val single = TestSchemas.single
    private val multi = TestSchemas.multi
    private val nuc = Alphabet.NUCLEOTIDE
    private val aa = Alphabet.AMINO_ACID
    private val s = single.gene("S")!!.index
    private val e = single.gene("E")!!.index

    private fun get(
        vararg params: Pair<String, String>,
        endpoint: Endpoint = Endpoint.DETAILS,
        schema: QuerySchema = single,
        path: String? = null,
    ): QueryRequest = LapisRequestParser.parse(
        schema,
        endpoint,
        path,
        params.groupBy({ it.first }, { it.second }),
        isGet = true,
    )

    private fun post(
        params: Map<String, List<Any?>>,
        endpoint: Endpoint = Endpoint.DETAILS,
        schema: QuerySchema = single,
        path: String? = null,
    ): QueryRequest = LapisRequestParser.parse(schema, endpoint, path, params, isGet = false)

    private fun getError(vararg params: Pair<String, String>, endpoint: Endpoint = Endpoint.DETAILS): String =
        assertThrows<QueryBadRequestException> { get(*params, endpoint = endpoint) }.message!!

    private fun postError(params: Map<String, List<Any?>>, endpoint: Endpoint = Endpoint.DETAILS): String =
        assertThrows<QueryBadRequestException> { post(params, endpoint = endpoint) }.message!!

    private fun filterOf(vararg params: Pair<String, String>): Filter = get(*params).filter

    private fun nt(position: Int, symbol: Char) = SymbolEquals(0, position, nuc.indexOf(symbol))

    // ---------------- keys ----------------

    @Test
    fun `no parameters gives True and defaults`() {
        val request = get()
        assertThat(request.filter, equalTo(True))
        assertThat(request.dataFormat, equalTo(DataFormat.JSON))
        assertThat(request.dataFormatFromParameter, equalTo(false))
        assertThat(request.limit, nullValue())
        assertThat(request.offset, equalTo(0))
        assertThat(request.minProportion, equalTo(0.05))
    }

    @Test
    fun `unknown key lists all valid keys in schema order`() {
        assertThat(
            getError("foo" to "bar"),
            equalTo(
                "'foo' is not a valid sequence filter key. Valid keys are: " +
                    "accessionVersion, accessionVersion.regex, accessionVersion.isNull, " +
                    "country, country.regex, country.isNull, " +
                    "date, dateFrom, dateTo, date.isNull, " +
                    "age, ageFrom, ageTo, age.isNull, " +
                    "qc, qcFrom, qcTo, qc.isNull, " +
                    "isRevocation, isRevocation.isNull, " +
                    "pangoLineage, pangoLineage.regex, pangoLineage.isNull, " +
                    "versionStatus, versionStatus.regex, versionStatus.isNull, " +
                    "advancedQuery",
            ),
        )
        assertThat(getError("ageFrom.regex" to "x"), startsWith("'ageFrom.regex' is not a valid sequence filter key"))
        assertThat(getError("isRevocationFrom" to "x"), startsWith("'isRevocationFrom' is not a valid"))
    }

    @Test
    fun `keys are case insensitive`() {
        assertThat(filterOf("COUNTRY" to "USA"), equalTo(StringEquals("country", "USA")))
        assertThat(filterOf("Country.Regex" to "US"), equalTo(StringRegex("country", "US")))
        assertThat(filterOf("DATEFROM" to "2021-01-01"), equalTo(DateBetween("date", epochDay("2021-01-01"), null)))
        assertThat(get("LIMIT" to "5").limit, equalTo(5))
    }

    // ---------------- string filters ----------------

    @Test
    fun `string equality`() {
        assertThat(filterOf("country" to "USA"), equalTo(StringEquals("country", "USA")))
        assertThat(filterOf("country" to ""), equalTo(StringEquals("country", "")))
        assertThat(
            filterOf("country" to "USA", "country" to "Germany"),
            equalTo(Or(listOf(StringEquals("country", "USA"), StringEquals("country", "Germany")))),
        )
        // GET metadata values are not comma-split
        assertThat(filterOf("country" to "a,b"), equalTo(StringEquals("country", "a,b")))
        assertThat(
            post(mapOf("country" to listOf("USA", null))).filter,
            equalTo(Or(listOf(StringEquals("country", "USA"), StringEquals("country", null)))),
        )
        assertThat(postError(mapOf("country" to emptyList())), startsWith("Filter 'country' must have at least one"))
    }

    @Test
    fun `regex filters`() {
        assertThat(filterOf("country.regex" to "^U"), equalTo(StringRegex("country", "^U")))
        assertThat(getError("country.regex" to "("), startsWith("Error from SILO: Invalid Regular Expression."))
        assertThat(
            getError("country" to "USA", "country.regex" to "U"),
            equalTo("Cannot filter for string regex 'country.regex' and string equals 'country' for the same field."),
        )
        assertThat(
            postError(mapOf("country.regex" to listOf(null))),
            equalTo("String search value for 'country.regex' must not be null"),
        )
    }

    // ---------------- dates / numbers / booleans ----------------

    @Test
    fun `date filters`() {
        val day = epochDay("2021-01-01")
        assertThat(filterOf("date" to "2021-01-01"), equalTo(DateBetween("date", day, day)))
        assertThat(
            filterOf("dateFrom" to "2021-01-01", "dateTo" to "2021-12-31"),
            equalTo(DateBetween("date", day, epochDay("2021-12-31"))),
        )
        assertThat(post(mapOf("date" to listOf(null))).filter, equalTo(IsNull("date")))
        assertThat(
            getError("date" to "2021-1-1"),
            equalTo("date '2021-1-1' is not a valid date: Text '2021-1-1' could not be parsed at index 5"),
        )
        assertThat(
            getError("dateFrom" to "2021-1-1"),
            startsWith("dateFrom '2021-1-1' is not a valid date"),
        )
        assertThat(
            getError("date" to "2021-01-01", "dateTo" to "2021-01-01"),
            equalTo("Cannot filter by exact date field 'date' and by date range field 'dateTo'."),
        )
        assertThat(
            getError("dateFrom" to "2021-01-01", "dateFrom" to "2021-01-02"),
            equalTo("Expected exactly one value for 'dateFrom' but got 2 values."),
        )
    }

    @Test
    fun `int and float filters`() {
        assertThat(filterOf("age" to "5"), equalTo(IntEquals("age", 5)))
        assertThat(post(mapOf("age" to listOf(5))).filter, equalTo(IntEquals("age", 5)))
        assertThat(filterOf("ageFrom" to "5", "ageTo" to "10"), equalTo(IntBetween("age", 5, 10)))
        assertThat(filterOf("ageTo" to "10"), equalTo(IntBetween("age", null, 10)))
        assertThat(getError("age" to "abc"), equalTo("age 'abc' is not a valid integer: For input string: \"abc\""))
        assertThat(getError("ageFrom" to "x"), equalTo("ageFrom 'x' is not a valid integer: For input string: \"x\""))
        assertThat(
            getError("age" to "5", "ageFrom" to "3"),
            equalTo("Cannot filter by exact int field 'age' and by int range field 'ageFrom'."),
        )
        assertThat(filterOf("qc" to "0.5"), equalTo(FloatEquals("qc", 0.5)))
        assertThat(filterOf("qcFrom" to "0.5"), equalTo(FloatBetween("qc", 0.5, null)))
        assertThat(getError("qc" to "abc"), startsWith("qc 'abc' is not a valid float: "))
        assertThat(
            getError("qc" to "0.5", "qcTo" to "3"),
            equalTo("Cannot filter by exact float field 'qc' and by float range field 'qcTo'."),
        )
    }

    @Test
    fun `boolean filters`() {
        assertThat(filterOf("isRevocation" to "TRUE"), equalTo(BooleanEquals("isRevocation", true)))
        assertThat(post(mapOf("isRevocation" to listOf(false))).filter, equalTo(BooleanEquals("isRevocation", false)))
        assertThat(getError("isRevocation" to "yes"), equalTo("'yes' is not a valid boolean."))
    }

    @Test
    fun `isNull filters`() {
        assertThat(filterOf("country.isNull" to "true"), equalTo(IsNull("country")))
        assertThat(filterOf("age.isNull" to "False"), equalTo(Not(IsNull("age"))))
        assertThat(post(mapOf("date.isNull" to listOf(true))).filter, equalTo(IsNull("date")))
        assertThat(
            getError("country.isNull" to "maybe"),
            equalTo("'maybe' is not a valid boolean value for 'country.isNull'"),
        )
        assertThat(
            getError("country.isNull" to "true", "country" to "USA"),
            equalTo("Cannot filter for field 'country' and 'country.isNull' at the same time."),
        )
        assertThat(
            getError("ageFrom" to "3", "age.isNull" to "true"),
            equalTo("Cannot filter for field 'ageFrom' and 'age.isNull' at the same time."),
        )
    }

    // ---------------- lineages ----------------

    @Test
    fun `lineage filters`() {
        assertThat(filterOf("pangoLineage" to "B.1.1.7"), equalTo(LineageIn("pangoLineage", setOf("B.1.1.7"))))
        assertThat(filterOf("pangoLineage" to "B.1.1.7*"), equalTo(LineageIn("pangoLineage", setOf("B.1.1.7"))))
        assertThat(filterOf("pangoLineage" to "BA.1"), equalTo(LineageIn("pangoLineage", setOf("B.1.1.529.1"))))
        assertThat(
            filterOf("pangoLineage" to "BA.1*"),
            equalTo(LineageIn("pangoLineage", setOf("B.1.1.529.1", "BA.1.1"))),
        )
        assertThat(
            filterOf("pangoLineage" to "B.1.1.529.1.*"),
            equalTo(LineageIn("pangoLineage", setOf("B.1.1.529.1", "BA.1.1"))),
        )
        // sublineages do not follow recombinant edges, but descendants of the recombinant are found from it
        assertThat(
            filterOf("pangoLineage" to "XA*"),
            equalTo(LineageIn("pangoLineage", setOf("XA", "XA.1"))),
        )
        assertThat(post(mapOf("pangoLineage" to listOf(null))).filter, equalTo(LineageIn("pangoLineage", null)))
        assertThat(
            getError("pangoLineage" to "B.1.1.7."),
            equalTo("Invalid pango lineage: B.1.1.7. must not end with a dot. Did you mean 'B.1.1.7.*'?"),
        )
        assertThat(
            getError("pangoLineage" to "b.1.1.7"),
            equalTo("Error from SILO: The lineage 'b.1.1.7' is not a valid lineage for column 'pangoLineage'."),
        )
        assertThat(
            filterOf("pangoLineage" to "B.1.1.7", "pangoLineage" to "A"),
            equalTo(Or(listOf(LineageIn("pangoLineage", setOf("B.1.1.7")), LineageIn("pangoLineage", setOf("A"))))),
        )
        assertThat(filterOf("pangoLineage.regex" to "^B"), equalTo(StringRegex("pangoLineage", "^B")))
    }

    // ---------------- mutations ----------------

    @Test
    fun `nucleotide mutations`() {
        fun mut(vararg m: String) = get("nucleotideMutations" to m.joinToString(",")).filter
        assertThat(mut("21T"), equalTo(nt(21, 'T')))
        assertThat(mut("G21T"), equalTo(nt(21, 'T')))
        assertThat(mut("21t"), equalTo(nt(21, 'T')))
        assertThat(mut("21U"), equalTo(nt(21, 'T')))
        assertThat(mut("21"), equalTo(HasMutation(0, 21)))
        assertThat(mut("21."), equalTo(nt(21, 'C')))
        assertThat(mut("21-"), equalTo(nt(21, '-')))
        assertThat(mut("MAIN:21Y"), equalTo(nt(21, 'Y')))
        assertThat(mut("maybe(21T)"), equalTo(Maybe(nt(21, 'T'))))
        assertThat(mut("MAYBE(21)"), equalTo(Maybe(HasMutation(0, 21))))
        assertThat(mut("21T", " 22A"), equalTo(And(listOf(nt(21, 'T'), nt(22, 'A')))))
    }

    @Test
    fun `nucleotide mutation errors`() {
        fun err(m: String) = getError("nucleotideMutations" to m)
        assertThat(err("21X"), equalTo("Error from SILO: nucleotideEquals() invalid symbol 'X'"))
        assertThat(err("0T"), equalTo("Error from SILO: The field 'position' is 1-indexed. Value of 0 not allowed."))
        assertThat(err("99999"), equalTo("Error from SILO: HasNucleotideMutation position is out of bounds 99999 > 30"))
        assertThat(err("99T"), equalTo("Error from SILO: SymbolEquals<Nucleotide> position is out of bounds 99 > 30"))
        assertThat(err("foo:21T"), equalTo("Unknown nucleotide sequence: foo"))
        assertThat(err("21TT"), equalTo("Invalid nucleotide mutation: 21TT"))
        val multiError = assertThrows<QueryBadRequestException> {
            get("nucleotideMutations" to "21T", schema = multi)
        }.message
        assertThat(
            multiError,
            equalTo(
                "The reference genome is multi-segmented, but no segment was specified in the nucleotide mutation " +
                    "'21T'. Please specify one, e.g. 'segmentName:A123T'.",
            ),
        )
        assertThat(
            get("nucleotideMutations" to "m:3G", schema = multi).filter,
            equalTo(SymbolEquals(1, 3, nuc.indexOf('G'))),
        )
    }

    @Test
    fun `amino acid mutations`() {
        fun mut(m: String) = get("aminoAcidMutations" to m).filter
        assertThat(mut("S:5L"), equalTo(SymbolEquals(s, 5, aa.indexOf('L'))))
        assertThat(mut("s:L5*"), equalTo(SymbolEquals(s, 5, aa.indexOf('*'))))
        assertThat(mut("E:9"), equalTo(HasMutation(e, 9)))
        assertThat(mut("E:9."), equalTo(SymbolEquals(e, 9, aa.indexOf('T'))))
        assertThat(mut("E:9x"), equalTo(SymbolEquals(e, 9, aa.indexOf('X'))))
        assertThat(mut("maybe(E:9I)"), equalTo(Maybe(SymbolEquals(e, 9, aa.indexOf('I')))))
        assertThat(getError("aminoAcidMutations" to "foo:5L"), equalTo("Unknown gene: foo"))
        assertThat(getError("aminoAcidMutations" to "5L"), equalTo("Invalid amino acid mutation: 5L"))
        assertThat(
            getError("aminoAcidMutations" to "S:11"),
            equalTo("Error from SILO: HasAminoAcidMutation position is out of bounds 11 > 10"),
        )
    }

    @Test
    fun `mutation lists are not comma split for POST`() {
        assertThat(
            postError(mapOf("nucleotideMutations" to listOf("21T,22A"))),
            equalTo("Invalid nucleotide mutation: 21T,22A"),
        )
        assertThat(
            post(mapOf("nucleotideMutations" to listOf("21T", "22A"))).filter,
            equalTo(And(listOf(nt(21, 'T'), nt(22, 'A')))),
        )
    }

    // ---------------- insertions ----------------

    @Test
    fun `insertions`() {
        fun nucIns(i: String) = get("nucleotideInsertions" to i).filter
        fun aaIns(i: String) = get("aminoAcidInsertions" to i).filter
        assertThat(nucIns("ins_10:TGTC"), equalTo(InsertionContains(0, 10, "TGTC")))
        assertThat(nucIns("ins_10:t?c"), equalTo(InsertionContains(0, 10, "T.*C")))
        assertThat(nucIns("INS_main:10:A.*"), equalTo(InsertionContains(0, 10, "A.*")))
        assertThat(nucIns("ins_30:?"), equalTo(InsertionContains(0, 30, ".*")))
        assertThat(aaIns("ins_S:5:EPE"), equalTo(InsertionContains(s, 5, "EPE")))
        assertThat(aaIns("ins_s:5:e?"), equalTo(InsertionContains(s, 5, "E.*")))
        assertThat(aaIns("ins_S:5:E*"), equalTo(InsertionContains(s, 5, "E\\*")))
        assertThat(
            getError("nucleotideInsertions" to "ins_99999:A"),
            equalTo(
                "Error from SILO: the requested insertion position (99999) is larger than the length of the " +
                    "reference sequence (30) for sequence 'main'",
            ),
        )
        assertThat(getError("aminoAcidInsertions" to "ins_foo:5:A"), equalTo("Unknown gene: foo"))
        assertThat(getError("nucleotideInsertions" to "ins_foo:5:A"), equalTo("Unknown nucleotide sequence: foo"))
        assertThat(getError("nucleotideInsertions" to "10:A"), equalTo("Invalid nucleotide mutation: 10:A"))
    }

    // ---------------- combination ----------------

    @Test
    fun `all filters are AND combined`() {
        val filter = get(
            "country" to "USA",
            "advancedQuery" to "21T | 22A",
            "nucleotideMutations" to "23G",
            "aminoAcidMutations" to "S:5L",
            "nucleotideInsertions" to "ins_10:A",
            "aminoAcidInsertions" to "ins_S:5:E",
        ).filter
        assertThat(
            filter,
            equalTo(
                And(
                    listOf(
                        StringEquals("country", "USA"),
                        Or(listOf(nt(21, 'T'), nt(22, 'A'))),
                        nt(23, 'G'),
                        SymbolEquals(s, 5, aa.indexOf('L')),
                        InsertionContains(0, 10, "A"),
                        InsertionContains(s, 5, "E"),
                    ),
                ),
            ),
        )
    }

    @Test
    fun `advancedQuery parameter`() {
        assertThat(filterOf("advancedQuery" to "country=USA"), equalTo(StringEquals("country", "USA")))
        assertThat(getError("advancedQuery" to " "), equalTo("advancedQuery must not be empty, got ' '"))
        assertThat(
            getError("advancedQuery" to "21T", "advancedQuery" to "22A"),
            equalTo("advancedQuery must have exactly one value, found 2 values."),
        )
    }

    // ---------------- fields / orderBy / limit / offset ----------------

    @Test
    fun `fields are canonicalized`() {
        assertThat(get("fields" to "COUNTRY, date").fields, equalTo(listOf("country", "date")))
        assertThat(post(mapOf("fields" to listOf("Country"))).fields, equalTo(listOf("country")))
        assertThat(
            getError("fields" to "foo"),
            equalTo(
                "Unknown field: 'foo', known values are [accessionVersion, country, date, age, qc, isRevocation, " +
                    "pangoLineage, versionStatus]",
            ),
        )
        assertThat(
            get("fields" to "mutation,count", endpoint = Endpoint.NUCLEOTIDE_MUTATIONS).fields,
            equalTo(listOf("mutation", "count")),
        )
        assertThat(
            getError("fields" to "country", endpoint = Endpoint.AMINO_ACID_MUTATIONS),
            startsWith("Invalid mutations field: country. Known values are mutation, count, coverage"),
        )
        assertThat(
            get("fields" to "insertion,insertedSymbols", endpoint = Endpoint.NUCLEOTIDE_INSERTIONS).fields,
            equalTo(listOf("insertion", "insertedSymbols")),
        )
    }

    @Test
    fun `orderBy GET`() {
        val request = get("orderBy" to "COUNTRY,date", "fields" to "country,date")
        assertThat(
            request.orderBy,
            equalTo(
                listOf(
                    OrderByField("country", OrderDirection.ASCENDING),
                    OrderByField("date", OrderDirection.ASCENDING),
                ),
            ),
        )
        assertThat(request.random, nullValue())
        assertThat(get("orderBy" to "random").random, equalTo(RandomOrder(null)))
        val seeded = get("orderBy" to "country,random(42)")
        assertThat(seeded.random, equalTo(RandomOrder(42)))
        assertThat(seeded.orderBy, equalTo(emptyList()))
        assertThat(
            getError("orderBy" to "random(x)"),
            equalTo(
                "Invalid random orderBy format: 'random(x)'. Use 'random' or 'random(<seed>)' where seed is a " +
                    "positive integer.",
            ),
        )
    }

    @Test
    fun `orderBy GET with a direction suffix parses like the POST object`() {
        val fields = "fields" to "country,date"
        val suffixed = get("orderBy" to "Date:descending,country:ascending", fields)
        val repeated = get("orderBy" to "date:descending", "orderBy" to "country", fields)
        val json = post(
            mapOf(
                "orderBy" to listOf(
                    mapOf("field" to "date", "type" to "descending"),
                    mapOf("field" to "country", "type" to "ascending"),
                ),
                "fields" to listOf("country", "date"),
            ),
        )
        val expected = listOf(
            OrderByField("date", OrderDirection.DESCENDING),
            OrderByField("country", OrderDirection.ASCENDING),
        )
        assertThat(suffixed.orderBy, equalTo(expected))
        assertThat(repeated.orderBy, equalTo(expected))
        assertThat(suffixed, equalTo(json))
        // the same spelling is accepted as a JSON string entry
        assertThat(post(mapOf("orderBy" to listOf("date:descending"))).orderBy, equalTo(expected.take(1)))
    }

    @Test
    fun `orderBy direction suffix errors`() {
        assertThat(
            getError("orderBy" to "date:desc"),
            equalTo("Invalid orderBy 'date:desc': use 'field', 'field:ascending' or 'field:descending'"),
        )
        assertThat(
            getError("orderBy" to ":descending"),
            equalTo("Invalid orderBy ':descending': the field name is missing"),
        )
        assertThat(
            getError("orderBy" to "random:descending"),
            equalTo("Invalid orderBy 'random:descending': random ordering takes no direction"),
        )
        assertThat(
            getError("orderBy" to "random(3):ascending"),
            equalTo("Invalid orderBy 'random(3):ascending': random ordering takes no direction"),
        )
        assertThat(
            getError("fields" to "country", "orderBy" to "date:descending"),
            equalTo(
                "Error from SILO: OrderByField date is not contained in the result of this operation. " +
                    "Allowed values are country.",
            ),
        )
    }

    @Test
    fun `orderBy POST`() {
        val request = post(
            mapOf(
                "orderBy" to listOf(mapOf("field" to "Date", "type" to "descending"), "country"),
            ),
        )
        assertThat(
            request.orderBy,
            equalTo(
                listOf(
                    OrderByField("date", OrderDirection.DESCENDING),
                    OrderByField("country", OrderDirection.ASCENDING),
                ),
            ),
        )
        assertThat(post(mapOf("orderBy" to listOf(mapOf("random" to true)))).random, equalTo(RandomOrder(null)))
        assertThat(post(mapOf("orderBy" to listOf(mapOf("random" to 7)))).random, equalTo(RandomOrder(7)))
        assertThat(
            postError(mapOf("orderBy" to listOf(mapOf("random" to false)))),
            equalTo("random must be true or an integer seed"),
        )
        assertThat(
            postError(mapOf("orderBy" to listOf(mapOf("field" to "date", "type" to "up")))),
            equalTo("orderByField type must be \"ascending\" or \"descending\""),
        )
    }

    @Test
    fun `orderBy must be part of the result`() {
        assertThat(
            getError("fields" to "country", "orderBy" to "date", endpoint = Endpoint.AGGREGATED),
            equalTo(
                "Error from SILO: OrderByField date is not contained in the result of this operation. " +
                    "Allowed values are country, count.",
            ),
        )
        assertThat(
            get("fields" to "country", "orderBy" to "count", endpoint = Endpoint.AGGREGATED).orderBy,
            equalTo(listOf(OrderByField("count", OrderDirection.ASCENDING))),
        )
        assertThat(
            get("orderBy" to "proportion", endpoint = Endpoint.NUCLEOTIDE_MUTATIONS).orderBy,
            equalTo(listOf(OrderByField("proportion", OrderDirection.ASCENDING))),
        )
    }

    @Test
    fun `limit and offset`() {
        assertThat(get("limit" to "10", "offset" to "5").let { it.limit to it.offset }, equalTo(10 to 5))
        assertThat(getError("limit" to "0"), equalTo("Error from SILO: limit must be a positive number"))
        assertThat(
            postError(mapOf("limit" to listOf(null))),
            equalTo("Error from SILO: limit must be a positive number"),
        )
        assertThat(postError(mapOf("limit" to listOf("5"))), startsWith("limit must be a number or null"))
        assertThat(getError("limit" to "abc"), startsWith("Failed to convert 'limit'"))
        assertThat(getError("offset" to "-1"), equalTo("Error from SILO: Cannot cast -1 to uint32. Value out of range"))
        assertThat(
            post(mapOf("limit" to listOf(3), "offset" to listOf(null))).let {
                it.limit to it.offset
            },
            equalTo(3 to 0),
        )
    }

    // ---------------- formats etc. ----------------

    @Test
    fun `dataFormat`() {
        assertThat(get("dataFormat" to "CSV").dataFormat, equalTo(DataFormat.CSV))
        assertThat(get("dataFormat" to "csv-without-headers").dataFormat, equalTo(DataFormat.CSV_WITHOUT_HEADERS))
        assertThat(get("dataFormat" to "tsv-escaped").dataFormat, equalTo(DataFormat.TSV_ESCAPED))
        assertThat(get("dataFormat" to "json").dataFormatFromParameter, equalTo(true))
        assertThrows<QueryNotAcceptableException> { get("dataFormat" to "fasta") }
        assertThrows<QueryNotAcceptableException> { get("dataFormat" to "xml") }
        assertThat(get(endpoint = Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES).dataFormat, equalTo(DataFormat.FASTA))
        assertThat(
            get("dataFormat" to "NDJSON", endpoint = Endpoint.UNALIGNED_NUCLEOTIDE_SEQUENCES).dataFormat,
            equalTo(DataFormat.NDJSON),
        )
        assertThrows<QueryNotAcceptableException> {
            get("dataFormat" to "csv", endpoint = Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES)
        }
    }

    @Test
    fun `download and compression`() {
        val request = get("downloadAsFile" to "true", "downloadFileBasename" to "my file", "compression" to "zstd")
        assertThat(request.downloadAsFile, equalTo(true))
        assertThat(request.downloadFileBasename, equalTo("my file"))
        assertThat(request.compression, equalTo(Compression.ZSTD))
        assertThat(post(mapOf("compression" to listOf("gzip"))).compression, equalTo(Compression.GZIP))
        assertThat(
            getError("compression" to "br"),
            equalTo("Unknown compression format: br. Supported formats are: gzip, zstd"),
        )
    }

    @Test
    fun `minProportion`() {
        assertThat(get(endpoint = Endpoint.NUCLEOTIDE_MUTATIONS).minProportion, equalTo(0.05))
        assertThat(get("minProportion" to "0.1", endpoint = Endpoint.NUCLEOTIDE_MUTATIONS).minProportion, equalTo(0.1))
        assertThat(
            post(mapOf("minProportion" to listOf(null)), endpoint = Endpoint.AMINO_ACID_MUTATIONS).minProportion,
            equalTo(0.05),
        )
        assertThat(
            post(mapOf("minProportion" to listOf(0)), endpoint = Endpoint.AMINO_ACID_MUTATIONS).minProportion,
            equalTo(0.0),
        )
        assertThat(
            postError(mapOf("minProportion" to listOf("x")), endpoint = Endpoint.NUCLEOTIDE_MUTATIONS),
            startsWith("minProportion must be a number"),
        )
        assertThat(
            post(mapOf("minProportion" to listOf(1)), endpoint = Endpoint.NUCLEOTIDE_MUTATIONS).minProportion,
            equalTo(1.0),
        )
        for (outOfRange in listOf("-1", "1.5", "NaN")) {
            assertThat(
                getError("minProportion" to outOfRange, endpoint = Endpoint.NUCLEOTIDE_MUTATIONS),
                equalTo("Error from SILO: Invalid proportion: minProportion must be in interval [0.0, 1.0]"),
            )
        }
        assertThat(
            postError(mapOf("minProportion" to listOf(2)), endpoint = Endpoint.AMINO_ACID_MUTATIONS),
            equalTo("Error from SILO: Invalid proportion: minProportion must be in interval [0.0, 1.0]"),
        )
        // not applicable to details: ignored
        assertThat(get("minProportion" to "0.5").minProportion, equalTo(0.05))
    }

    // ---------------- sequence endpoints ----------------

    @Test
    fun `single segmented sequence endpoints`() {
        val request = get(endpoint = Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES)
        assertThat(request.sequenceIndices, equalTo(listOf(0)))
        assertThat(request.fastaHeaderTemplate, equalTo("{accessionVersion}"))
        // segments is ignored for single segmented organisms
        assertThat(
            get("segments" to "foo", endpoint = Endpoint.UNALIGNED_NUCLEOTIDE_SEQUENCES).sequenceIndices,
            equalTo(listOf(0)),
        )
        assertThrows<QueryNotFoundException> { get(endpoint = Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES, path = "main") }
    }

    @Test
    fun `multi segmented sequence endpoints`() {
        val all = get(endpoint = Endpoint.UNALIGNED_NUCLEOTIDE_SEQUENCES, schema = multi)
        assertThat(all.sequenceIndices, equalTo(listOf(0, 1)))
        assertThat(all.fastaHeaderTemplate, equalTo("{accessionVersion}|{.segment}"))

        val selected = get("segments" to "m,L", endpoint = Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES, schema = multi)
        assertThat(selected.sequenceIndices, equalTo(listOf(1, 0)))

        val path = get(endpoint = Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES, schema = multi, path = "M")
        assertThat(path.sequenceIndices, equalTo(listOf(1)))
        assertThat(path.fastaHeaderTemplate, equalTo("{accessionVersion}"))

        assertThrows<QueryNotFoundException> {
            get(endpoint = Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES, schema = multi, path = "X")
        }
        val error = assertThrows<QueryBadRequestException> {
            get("segments" to "L,foo", endpoint = Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES, schema = multi)
        }.message
        assertThat(error, equalTo("Unknown segment: foo, available segments: [L, M]"))
    }

    @Test
    fun `amino acid sequence endpoints`() {
        val all = get(endpoint = Endpoint.ALIGNED_AMINO_ACID_SEQUENCES)
        assertThat(all.sequenceIndices, equalTo(listOf(s, e)))
        assertThat(all.fastaHeaderTemplate, equalTo("{accessionVersion}|{.gene}"))
        assertThat(
            get("genes" to "E", endpoint = Endpoint.ALIGNED_AMINO_ACID_SEQUENCES).sequenceIndices,
            equalTo(listOf(e)),
        )
        val path = get(endpoint = Endpoint.ALIGNED_AMINO_ACID_SEQUENCES, path = "s")
        assertThat(path.sequenceIndices, equalTo(listOf(s)))
        assertThat(path.fastaHeaderTemplate, equalTo("{accessionVersion}"))
        assertThrows<QueryNotFoundException> { get(endpoint = Endpoint.ALIGNED_AMINO_ACID_SEQUENCES, path = "X") }
        assertThat(
            getError("genes" to "X", endpoint = Endpoint.ALIGNED_AMINO_ACID_SEQUENCES),
            equalTo("Unknown gene: X, available genes: [S, E]"),
        )
    }

    @Test
    fun `fasta header templates`() {
        assertThat(
            get(
                "fastaHeaderTemplate" to "{ACCESSIONVERSION}|{Country}|{.SEGMENT}",
                endpoint = Endpoint.UNALIGNED_NUCLEOTIDE_SEQUENCES,
            ).fastaHeaderTemplate,
            equalTo("{accessionVersion}|{country}|{.segment}"),
        )
        assertThat(
            getError("fastaHeaderTemplate" to "{.gene}", endpoint = Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES),
            equalTo("Invalid FASTA header template: '.gene' is only valid for amino acid sequences."),
        )
        assertThat(
            getError("fastaHeaderTemplate" to "{.segment}", endpoint = Endpoint.ALIGNED_AMINO_ACID_SEQUENCES),
            equalTo("Invalid FASTA header template: '.segment' is only valid for nucleotide sequences."),
        )
        assertThat(
            getError("fastaHeaderTemplate" to "{foo}", endpoint = Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES),
            startsWith("Invalid FASTA header template: 'foo' is not a valid metadata field. Available fields: "),
        )
        assertThat(
            getError(
                "fastaHeaderTemplate" to "{country}",
                "dataFormat" to "json",
                endpoint = Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES,
            ),
            equalTo("fastaHeaderTemplate is only applicable for FASTA format, but received: {country}"),
        )
        assertThat(
            get("dataFormat" to "json", endpoint = Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES).fastaHeaderTemplate,
            nullValue(),
        )
    }
}
