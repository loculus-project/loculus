package org.loculus.backend.query.api

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.query.request.DataFormat
import org.loculus.backend.query.request.Endpoint
import org.loculus.backend.query.request.OrderByField
import org.loculus.backend.query.request.OrderDirection
import org.loculus.backend.query.request.QueryBadRequestException
import org.loculus.backend.query.request.QueryRequest
import org.loculus.backend.query.store.SequenceKind
import java.io.ByteArrayOutputStream

class LapisQueryExecutorTest {
    private val schema = testSchema(genes = listOf("E", "S"))
    private val info = LapisInfo("1234", "r", "Test Instance on h at t")

    // stored jsonb prints keys in its own order and numbers in numeric style
    private val metadata = mapOf(
        1 to """{"age": 3, "date": "2021-01-01", "country": "CH", "coverage": 0.000010, "isRevocation": false, """ +
            """"pangoLineage": null, "accessionVersion": "A.1"}""",
        2 to """{"age": null, "date": null, "country": "Brazil, \"north\"", "coverage": 12.50, """ +
            """"isRevocation": true, "accessionVersion": "B.1"}""",
        3 to """{"accessionVersion": "C.1", "country": "DE", "age": 5}""",
    )
    private val index = FakeIndex(schema, metadata.keys.associateWith { emptyMap() })
    private val store = FakeStore(
        metadata,
        mapOf(
            Triple(SequenceKind.ALIGNED_AMINO_ACID, 1, 1) to "MKT*",
            Triple(SequenceKind.ALIGNED_AMINO_ACID, 2, 1) to "MXXX",
            Triple(SequenceKind.ALIGNED_AMINO_ACID, 2, 3) to "MKKK",
            Triple(SequenceKind.UNALIGNED_NUCLEOTIDE, 0, 2) to "ACGT",
        ),
    )
    private val executor = LapisQueryExecutor(store)

    private fun run(request: QueryRequest): Pair<LapisBody, String> {
        val body = executor.execute("test", index, request) { info }
        val out = ByteArrayOutputStream()
        body.write(out)
        return body to out.toString(Charsets.UTF_8)
    }

    @Test
    fun `small details are buffered and read at once, with the same bytes as the streamed path`() {
        // 4 has no record (deleted meanwhile): skipped by both paths
        index.selectResult = intArrayOf(3, 4, 1, 2)
        val streaming = LapisQueryExecutor(store, bufferedDetailsMaxRows = 0)
        for (format in listOf(
            DataFormat.JSON,
            DataFormat.CSV,
            DataFormat.CSV_WITHOUT_HEADERS,
            DataFormat.TSV,
            DataFormat.TSV_ESCAPED,
        )) {
            val request = QueryRequest(Endpoint.DETAILS, dataFormat = format)
            val (buffered, bufferedOutput) = run(request)
            val streamed = streaming.execute("test", index, request) { info }
            val streamedOutput = ByteArrayOutputStream().also { streamed.write(it) }.toString(Charsets.UTF_8)
            assertThat(buffered.buffered, equalTo(true))
            assertThat(streamed.buffered, equalTo(false))
            assertThat(format.name, bufferedOutput, equalTo(streamedOutput))
        }
        assertThat(run(QueryRequest(Endpoint.DETAILS, downloadAsFile = true)).first.buffered, equalTo(false))
    }

    @Test
    fun `details projects fields in request order and normalises types`() {
        val (body, output) = run(
            QueryRequest(
                Endpoint.DETAILS,
                fields = listOf("country", "coverage", "age", "isRevocation"),
                downloadAsFile = true,
            ),
        )
        assertThat(body.contentType, equalTo("application/json"))
        assertThat(
            output,
            equalTo(
                """[{"country":"CH","coverage":1.0E-5,"age":3,"isRevocation":false},""" +
                    """{"country":"Brazil, \"north\"","coverage":12.5,"age":null,"isRevocation":true},""" +
                    """{"country":"DE","coverage":null,"age":5,"isRevocation":null}]""",
            ),
        )
    }

    @Test
    fun `details without fields returns all schema fields in schema order, CSV`() {
        index.selectResult = intArrayOf(3, 1)
        val (body, output) = run(QueryRequest(Endpoint.DETAILS, dataFormat = DataFormat.CSV))
        assertThat(body.contentType, equalTo("text/csv;charset=UTF-8"))
        assertThat(
            output,
            equalTo(
                "accessionVersion,country,date,age,coverage,isRevocation,pangoLineage\n" +
                    "C.1,DE,,5,,,\n" +
                    "A.1,CH,2021-01-01,3,1.0E-5,false,\n",
            ),
        )
    }

    @Test
    fun `details orderBy must be one of the fields`() {
        val e = assertThrows<QueryBadRequestException> {
            run(
                QueryRequest(
                    Endpoint.DETAILS,
                    fields = listOf("date", "country"),
                    orderBy = listOf(OrderByField("age", OrderDirection.ASCENDING)),
                ),
            )
        }
        assertThat(
            e.message,
            equalTo(
                "Error from SILO: OrderByField age is not contained in the result of this operation. Allowed values are date, country.",
            ),
        )
    }

    @Test
    fun `FASTA with default and custom header templates, null sequences skipped`() {
        val (body, output) = run(
            QueryRequest(
                Endpoint.ALIGNED_AMINO_ACID_SEQUENCES,
                dataFormat = DataFormat.FASTA,
                sequenceIndices = listOf(2, 1),
                fastaHeaderTemplate = "{accessionVersion}|{.gene}",
            ),
        )
        assertThat(body.contentType, equalTo("text/x-fasta;charset=UTF-8"))
        assertThat(output, equalTo(">A.1|S\nMXXX\n>A.1|E\nMKT*\n>C.1|S\nMKKK\n"))

        val (_, custom) = run(
            QueryRequest(
                Endpoint.ALIGNED_AMINO_ACID_SEQUENCES,
                dataFormat = DataFormat.FASTA,
                sequenceIndices = listOf(1),
                fastaHeaderTemplate = "{COUNTRY}/{date}/{coverage} {.segment}",
            ),
        )
        assertThat(custom, equalTo(">CH/2021-01-01/1.0E-5 E\nMKT*\n"))
        assertThat(store.requestedFieldLists.last(), contains("country", "date", "coverage"))
    }

    @Test
    fun `JSON and NDJSON sequences include rows and nulls for missing sequences`() {
        val (body, output) = run(
            QueryRequest(
                Endpoint.ALIGNED_AMINO_ACID_SEQUENCES,
                dataFormat = DataFormat.JSON,
                sequenceIndices = listOf(1, 2),
            ),
        )
        assertThat(body.contentType, equalTo("application/json;charset=UTF-8"))
        assertThat(
            output,
            equalTo(
                """[{"accessionVersion":"A.1","E":"MKT*","S":"MXXX"},""" +
                    """{"accessionVersion":"B.1","E":null,"S":null},""" +
                    """{"accessionVersion":"C.1","E":null,"S":"MKKK"}]""",
            ),
        )
        val (ndBody, nd) = run(
            QueryRequest(
                Endpoint.UNALIGNED_NUCLEOTIDE_SEQUENCES,
                dataFormat = DataFormat.NDJSON,
                sequenceIndices = listOf(0),
            ),
        )
        assertThat(ndBody.contentType, equalTo("application/x-ndjson;charset=UTF-8"))
        assertThat(
            nd,
            equalTo(
                """{"accessionVersion":"A.1","main":null}""" + "\n" +
                    """{"accessionVersion":"B.1","main":"ACGT"}""" + "\n" +
                    """{"accessionVersion":"C.1","main":null}""" + "\n",
            ),
        )
    }

    @Test
    fun `mutations pass minProportion to the index`() {
        run(QueryRequest(Endpoint.NUCLEOTIDE_MUTATIONS, minProportion = 0.3))
        assertThat(index.lastMinProportion, equalTo(0.3))
    }
}

class FastaHeaderTemplateTest {
    private val schema = testSchema()

    @Test
    fun `renders fields case-insensitively, nulls as empty and the sequence name`() {
        val template = FastaHeaderTemplate.parse("x{Country}_{.segment}{DATE}{country}y", schema)
        assertThat(template.fields, contains("country", "date"))
        assertThat(template.render(arrayOf("CH", null), "main"), equalTo("xCH_mainCHy"))
        assertThat(FastaHeaderTemplate.parse("{.gene}", schema).render(null, "S"), equalTo("S"))
        assertThat(FastaHeaderTemplate.parse("no placeholders", schema).render(null, "S"), equalTo("no placeholders"))
    }

    @Test
    fun `rejects unknown fields`() {
        val e = assertThrows<QueryBadRequestException> { FastaHeaderTemplate.parse("{foo}", schema) }
        assertThat(
            e.message!!.startsWith("Invalid FASTA header template: 'foo' is not a valid metadata field"),
            equalTo(true),
        )
    }
}
