package org.loculus.backend.query.api

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.query.index.AggregatedRow
import org.loculus.backend.query.request.DataFormat
import org.loculus.backend.query.request.Endpoint
import org.loculus.backend.query.request.OrderByField
import org.loculus.backend.query.request.OrderDirection.ASCENDING
import org.loculus.backend.query.request.OrderDirection.DESCENDING
import org.loculus.backend.query.request.QueryBadRequestException
import org.loculus.backend.query.request.QueryRequest
import org.loculus.backend.query.request.RandomOrder
import java.io.ByteArrayOutputStream

class TableOutputTest {
    private val info = LapisInfo("42", "req-1", "Test on host at 2024-01-01T00:00")

    private fun write(format: DataFormat, shape: TableShape, rows: List<Row>, envelope: Boolean = true): String {
        val out = ByteArrayOutputStream()
        val writer = tableWriter(format, shape, out, envelope) { info }
        writer.start()
        rows.forEach(writer::row)
        writer.finish()
        return out.toString(Charsets.UTF_8)
    }

    private val shape = TableShape(listOf("a", "b", "c"))

    @Test
    fun `CSV uses minimal quoting, null as empty and LF line endings`() {
        val rows = listOf<Row>(
            arrayOf(null, true, 1.5),
            arrayOf("", false, 3L),
            arrayOf("x,y", "say \"hi\"", "line\nbreak"),
            arrayOf("#comment", "trailing ", "ümlaut"),
        )
        assertThat(
            write(DataFormat.CSV, shape, rows),
            equalTo(
                "a,b,c\n" +
                    ",true,1.5\n" +
                    "\"\",false,3\n" +
                    "\"x,y\",\"say \"\"hi\"\"\",\"line\nbreak\"\n" +
                    "\"#comment\",\"trailing \",ümlaut\n",
            ),
        )
    }

    @Test
    fun `csv without headers, tsv and escaped tsv`() {
        val rows = listOf<Row>(arrayOf("x\ty", null, "a\nb"))
        assertThat(write(DataFormat.CSV_WITHOUT_HEADERS, shape, rows), equalTo("x\ty,,\"a\nb\"\n"))
        assertThat(write(DataFormat.TSV, shape, rows), equalTo("a\tb\tc\n\"x\ty\"\t\t\"a\nb\"\n"))
        assertThat(write(DataFormat.TSV_ESCAPED, shape, rows), equalTo("a\tb\tc\nx\\ty\t\ta\\nb\n"))
    }

    @Test
    fun `JSON envelope and bare array`() {
        val rows = listOf<Row>(arrayOf("x", null, 0.1), arrayOf("\"q\"", 2L, true))
        val expectedData = """[{"a":"x","b":null,"c":0.1},{"a":"\"q\"","b":2,"c":true}]"""
        assertThat(write(DataFormat.JSON, shape, rows, envelope = false), equalTo(expectedData))
        assertThat(
            write(DataFormat.JSON, shape, rows),
            equalTo(
                """{"data":$expectedData,"info":{"dataVersion":"42","requestId":"req-1",""" +
                    """"requestInfo":"Test on host at 2024-01-01T00:00","reportTo":"$REPORT_TO",""" +
                    """"lapisVersion":"$LAPIS_VERSION"}}""",
            ),
        )
    }

    @Test
    fun `aggregated puts count first in JSON and last in CSV`() {
        val request = QueryRequest(Endpoint.AGGREGATED, fields = listOf("country", "date"))
        val table = LapisQueryExecutor.aggregated(
            request,
            listOf(AggregatedRow(listOf("CH", "2020-01-01"), 3), AggregatedRow(listOf(null, null), 1)),
        )
        assertThat(
            write(DataFormat.JSON, table.shape, table.rows, envelope = false),
            equalTo("""[{"count":3,"country":"CH","date":"2020-01-01"},{"count":1,"country":null,"date":null}]"""),
        )
        assertThat(
            write(DataFormat.CSV, table.shape, table.rows),
            equalTo("country,date,count\nCH,2020-01-01,3\n,,1\n"),
        )
    }

    private fun agg(vararg rows: Pair<String?, Long>) = rows.map { AggregatedRow(listOf(it.first), it.second) }

    private fun countries(table: Table) = table.rows.map { it[1] }

    @Test
    fun `aggregated ordering puts nulls first ascending and last descending, stable`() {
        val groups = agg("B" to 1, null to 2, "A" to 1, "C" to 5)
        val asc = LapisQueryExecutor.aggregated(
            QueryRequest(
                Endpoint.AGGREGATED,
                fields = listOf("country"),
                orderBy = listOf(OrderByField("country", ASCENDING)),
            ),
            groups,
        )
        assertThat(countries(asc), contains(null, "A", "B", "C"))
        val desc = LapisQueryExecutor.aggregated(
            QueryRequest(
                Endpoint.AGGREGATED,
                fields = listOf("country"),
                orderBy = listOf(OrderByField("country", DESCENDING)),
            ),
            groups,
        )
        assertThat(countries(desc), contains("C", "B", "A", null))
        val byCount = LapisQueryExecutor.aggregated(
            QueryRequest(
                Endpoint.AGGREGATED,
                fields = listOf("country"),
                orderBy = listOf(OrderByField("count", ASCENDING)),
            ),
            groups,
        )
        // stable: B before A (both count 1)
        assertThat(countries(byCount), contains("B", "A", null, "C"))
    }

    @Test
    fun `aggregated pipeline is orderBy, offset, random, limit`() {
        val groups = agg("A" to 1, "B" to 2, "C" to 3, "D" to 4, "E" to 5)
        val table = LapisQueryExecutor.aggregated(
            QueryRequest(
                Endpoint.AGGREGATED,
                fields = listOf("country"),
                orderBy = listOf(OrderByField("count", DESCENDING)),
                offset = 1,
                limit = 2,
            ),
            groups,
        )
        assertThat(countries(table), contains("D", "C"))

        val shuffled = LapisQueryExecutor.aggregated(
            QueryRequest(
                Endpoint.AGGREGATED,
                fields = listOf("country"),
                random = RandomOrder(7),
                offset = 1,
                limit = 3,
            ),
            groups,
        )
        assertThat(shuffled.rows.size, equalTo(3))
        // offset is applied before shuffling: A can never be part of the result
        assertThat(countries(shuffled).all { it in listOf("B", "C", "D", "E") }, equalTo(true))
        val again = LapisQueryExecutor.aggregated(
            QueryRequest(
                Endpoint.AGGREGATED,
                fields = listOf("country"),
                random = RandomOrder(7),
                offset = 1,
                limit = 3,
            ),
            groups,
        )
        assertThat(countries(again), equalTo(countries(shuffled)))

        val all = LapisQueryExecutor.aggregated(
            QueryRequest(Endpoint.AGGREGATED, fields = listOf("country"), random = RandomOrder(null)),
            groups,
        )
        assertThat(countries(all), containsInAnyOrder("A", "B", "C", "D", "E"))
    }

    @Test
    fun `aggregated orderBy must be in the output`() {
        val e = assertThrows<QueryBadRequestException> {
            LapisQueryExecutor.aggregated(
                QueryRequest(
                    Endpoint.AGGREGATED,
                    fields = listOf("country"),
                    orderBy = listOf(OrderByField("date", ASCENDING)),
                ),
                emptyList(),
            )
        }
        assertThat(
            e.message,
            equalTo(
                "Error from SILO: OrderByField date is not contained in the result of this operation. " +
                    "Allowed values are country, count.",
            ),
        )
    }

    @Test
    fun `value comparator orders numbers numerically`() {
        val values = listOf<Any?>(10L, 9L, null, 2.5, 100L).sortedWith(LapisValueComparator)
        assertThat(values, contains(null, 2.5, 9L, 10L, 100L))
    }
}
