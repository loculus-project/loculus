package org.loculus.backend.query.api

import com.github.luben.zstd.ZstdInputStream
import io.mockk.every
import io.mockk.mockk
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.nullValue
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.query.QuerySchemaRegistry
import org.loculus.backend.query.index.AggregatedRow
import org.loculus.backend.query.index.OrganismIndex
import org.loculus.backend.query.index.OrganismIndexProvider
import org.loculus.backend.query.request.Compression
import org.loculus.backend.query.request.DataFormat
import org.loculus.backend.query.request.Endpoint
import org.loculus.backend.query.request.QueryBadRequestException
import org.loculus.backend.query.request.QueryRequest
import org.loculus.backend.query.request.RandomOrder
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.MvcResult
import org.springframework.test.web.servlet.RequestBuilder
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.io.ByteArrayInputStream
import java.util.zip.GZIPInputStream

class LapisQueryControllerTest {
    private val schema = testSchema()
    private val index = FakeIndex(
        schema,
        mapOf(1 to emptyMap()),
        dataVersion = 1700000000,
        aggregateResult = listOf(AggregatedRow(listOf("CH"), 3)),
    )
    private var indexAvailable = true

    private data class ParseCall(
        val endpoint: Endpoint,
        val pathSequenceName: String?,
        val params: Map<String, List<Any?>>,
        val isGet: Boolean,
    )

    private val parseCalls = mutableListOf<ParseCall>()
    private var parsed: (Endpoint) -> QueryRequest = { QueryRequest(it) }

    private val mockMvc: MockMvc = run {
        val schemas = mockk<QuerySchemaRegistry>()
        every { schemas.get(any()) } returns null
        every { schemas.get("test") } returns schema
        val provider = object : OrganismIndexProvider {
            override fun get(organism: String): OrganismIndex? = if (indexAvailable &&
                organism == "test"
            ) {
                index
            } else {
                null
            }
        }
        val parser = QueryRequestParser { _, endpoint, name, params, isGet ->
            parseCalls.add(ParseCall(endpoint, name, params, isGet))
            parsed(endpoint)
        }
        val store = FakeStore(mapOf(1 to """{"accessionVersion":"A.1","country":"CH"}"""))
        MockMvcBuilders.standaloneSetup(LapisQueryController(schemas, provider, parser, store))
            .setControllerAdvice(LapisExceptionHandler(schemas))
            .build()
    }

    private fun perform(request: RequestBuilder): MvcResult {
        val started = mockMvc.perform(request).andReturn()
        return if (started.request.isAsyncStarted) mockMvc.perform(asyncDispatch(started)).andReturn() else started
    }

    @Test
    fun `GET aggregated returns the LAPIS envelope and headers`() {
        parsed = { QueryRequest(it, fields = listOf("country")) }
        val result = perform(get("/test/sample/aggregated").param("fields", "country").param("country", "CH", "DE"))
        assertThat(result.response.status, equalTo(200))
        assertThat(result.response.getHeader("Content-Type"), equalTo("application/json"))
        assertThat(result.response.getHeader(LAPIS_DATA_VERSION_HEADER), equalTo("1700000000"))
        listOf(
            jsonPath("\$.info.dataVersion").value("1700000000"),
            jsonPath("\$.info.lapisVersion").value(LAPIS_VERSION),
            jsonPath("\$.info.requestInfo").value(startsWith("Test Instance on localhost at ")),
        ).forEach { it.match(result) }
        assertThat(result.response.contentAsString, startsWith("""{"data":[{"count":3,"country":"CH"}],"info":{"""))
        val call = parseCalls.first()
        assertThat(call.endpoint, equalTo(Endpoint.AGGREGATED))
        assertThat(call.isGet, equalTo(true))
        assertThat(call.params["country"], contains("CH", "DE"))
        assertThat(call.params["fields"], contains("country"))
    }

    @Test
    fun `POST JSON bodies are flattened, objects kept`() {
        perform(
            post("/test/sample/aggregated")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """{"fields":["country","date"],"limit":5,"country":null,
                        |"orderBy":[{"field":"count","type":"descending"},"date"],"minProportion":0.5}
                    """.trimMargin(),
                ),
        )
        val call = parseCalls.single()
        assertThat(call.isGet, equalTo(false))
        assertThat(call.params["fields"], contains("country", "date"))
        assertThat(call.params["limit"], contains(5))
        assertThat(call.params["country"], contains(nullValue()))
        assertThat(call.params["minProportion"], contains(0.5))
        assertThat(call.params["orderBy"]!![0], equalTo(mapOf("field" to "count", "type" to "descending")))
        assertThat(call.params["orderBy"]!![1], equalTo("date"))
    }

    @Test
    fun `POST form bodies behave like GET`() {
        perform(
            post("/test/sample/details")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .content("fields=country&country=CH&country=DE"),
        )
        val call = parseCalls.single()
        assertThat(call.isGet, equalTo(true))
        assertThat(call.params["country"], contains("CH", "DE"))
    }

    @Test
    fun `Accept header selects the data format when there is no dataFormat parameter`() {
        perform(get("/test/sample/aggregated").header("Accept", "text/csv"))
        assertThat(parseCalls.last().params["dataFormat"], contains("csv"))
        perform(get("/test/sample/aggregated").header("Accept", "text/csv").param("dataFormat", "tsv"))
        assertThat(parseCalls.last().params["dataFormat"], contains("tsv"))
        perform(get("/test/sample/alignedNucleotideSequences").header("Accept", "application/x-ndjson"))
        assertThat(parseCalls.last().params["dataFormat"], contains("ndjson"))
    }

    @Test
    fun `download as file with compression`() {
        parsed = {
            QueryRequest(
                it,
                fields = listOf("country"),
                dataFormat = DataFormat.CSV,
                downloadAsFile = true,
                downloadFileBasename = "my data ä",
                compression = Compression.GZIP,
            )
        }
        val result = perform(get("/test/sample/aggregated").header("Accept-Encoding", "zstd"))
        assertThat(result.response.getHeader("Content-Type"), equalTo("application/gzip"))
        assertThat(result.response.getHeader("Content-Encoding"), nullValue())
        assertThat(
            result.response.getHeader("Content-Disposition"),
            equalTo("attachment; filename=my data .csv.gz; filename*=UTF-8''my%20data%20%C3%A4.csv.gz"),
        )
        val text = GZIPInputStream(
            ByteArrayInputStream(result.response.contentAsByteArray),
        ).readBytes().decodeToString()
        assertThat(text, equalTo("country,count\nCH,3\n"))
    }

    @Test
    fun `download as JSON is a bare array`() {
        parsed = { QueryRequest(it, fields = listOf("country"), downloadAsFile = true) }
        val result = perform(get("/test/sample/aggregated"))
        assertThat(result.response.contentAsString, equalTo("""[{"count":3,"country":"CH"}]"""))
        assertThat(
            result.response.getHeader("Content-Disposition"),
            equalTo("attachment; filename=aggregated.json; filename*=UTF-8''aggregated.json"),
        )
    }

    @Test
    fun `Accept-Encoding zstd is used as Content-Encoding`() {
        parsed = { QueryRequest(it, fields = listOf("country")) }
        val result = perform(get("/test/sample/aggregated").header("Accept-Encoding", "gzip, deflate, br, zstd"))
        assertThat(result.response.getHeader("Content-Encoding"), equalTo("zstd"))
        assertThat(result.response.getHeader("Content-Type"), equalTo("application/json"))
        val text = ZstdInputStream(
            ByteArrayInputStream(result.response.contentAsByteArray),
        ).readBytes().decodeToString()
        assertThat(text, startsWith("""{"data":[{"count":3,"country":"CH"}]"""))
    }

    @Test
    fun `bad requests produce the LAPIS error envelope`() {
        parsed = { throw QueryBadRequestException("Error from SILO: limit must be a positive number") }
        mockMvc.perform(get("/test/sample/aggregated"))
            .andExpect(status().isBadRequest)
            .andExpect(header().string("Content-Type", "application/json"))
            .andExpect(jsonPath("\$.error.detail").value("Error from SILO: limit must be a positive number"))
            .andExpect(jsonPath("\$.error.status").value(400))
            .andExpect(jsonPath("\$.error.title").value("Bad request"))
            .andExpect(jsonPath("\$.error.type").value("about:blank"))
            .andExpect(jsonPath("\$.info.dataVersion").value(nullValue()))
            .andExpect(jsonPath("\$.info.requestInfo").value(startsWith("Test Instance on localhost at ")))

        parsed = { throw QueryBadRequestException("'foo' is not a valid sequence filter key.") }
        mockMvc.perform(get("/test/sample/aggregated")).andExpect(jsonPath("\$.error.title").value("Bad Request"))
    }

    @Test
    fun `malformed JSON is a bad request`() {
        mockMvc.perform(post("/test/sample/aggregated").contentType(MediaType.APPLICATION_JSON).content("{"))
            .andExpect(status().isBadRequest)
    }

    @Test
    fun `unknown organisms, routes and sequence names are 404`() {
        mockMvc.perform(get("/other/sample/aggregated")).andExpect(status().isNotFound)
            .andExpect(jsonPath("\$.error.status").value(404))
        mockMvc.perform(get("/test/sample/foo")).andExpect(status().isNotFound)
        // single segmented: no /main route
        mockMvc.perform(get("/test/sample/alignedNucleotideSequences/main")).andExpect(status().isNotFound)
        mockMvc.perform(get("/test/sample/alignedAminoAcidSequences/X")).andExpect(status().isNotFound)
        mockMvc.perform(get("/test/sample/details/E")).andExpect(status().isNotFound)
    }

    @Test
    fun `gene routes pass the path sequence name to the parser`() {
        parsed = { QueryRequest(it, dataFormat = DataFormat.FASTA, sequenceIndices = listOf(1)) }
        val result = perform(get("/test/sample/alignedAminoAcidSequences/E"))
        assertThat(result.response.status, equalTo(200))
        assertThat(parseCalls.single().pathSequenceName, equalTo("E"))
        assertThat(result.response.getHeader("Content-Type"), equalTo("text/x-fasta;charset=UTF-8"))
    }

    @Test
    fun `503 while the index is not ready`() {
        indexAvailable = false
        mockMvc.perform(get("/test/sample/aggregated"))
            .andExpect(status().isServiceUnavailable)
            .andExpect(jsonPath("\$.error.status").value(503))
    }

    @Test
    fun `info and lineage definition`() {
        mockMvc.perform(get("/test/sample/info"))
            .andExpect(status().isOk)
            .andExpect(header().string(LAPIS_DATA_VERSION_HEADER, "1700000000"))
            .andExpect(jsonPath("\$.dataVersion").value("1700000000"))
            .andExpect(jsonPath("\$.lapisVersion").value(LAPIS_VERSION))
        mockMvc.perform(get("/test/sample/lineageDefinition/pangoLineage"))
            .andExpect(status().isOk)
            .andExpect(
                content().string("""{"A":{},"A.1":{"parents":["A"]},"B":{"parents":["A"],"aliases":["A.2"]}}"""),
            )
        mockMvc.perform(get("/test/sample/lineageDefinition/country"))
            .andExpect(status().isBadRequest)
            .andExpect(
                jsonPath(
                    "\$.error.detail",
                ).value("Error from SILO: The column country does not have a lineageIndex defined."),
            )
    }

    @Test
    fun `responses carry a weak ETag, no-cache and Vary`() {
        parsed = { QueryRequest(it, fields = listOf("country")) }
        val result = perform(get("/test/sample/aggregated"))
        assertThat(result.response.status, equalTo(200))
        assertThat(result.response.getHeader("ETag"), startsWith("W/\"1700000000-1700000000-"))
        assertThat(result.response.getHeader("Cache-Control"), equalTo("no-cache"))
        assertThat(result.response.getHeaders("Vary"), contains("Accept, Accept-Encoding"))
    }

    @Test
    fun `a matching If-None-Match is answered with 304 before the query runs, for GET and POST`() {
        val etag = perform(get("/test/sample/details")).response.getHeader("ETag")!!
        index.lastFilter = null
        val notModified = perform(get("/test/sample/details").header("If-None-Match", "\"other\", $etag"))
        assertThat(notModified.response.status, equalTo(304))
        assertThat(notModified.response.contentAsString, equalTo(""))
        assertThat(notModified.response.getHeader("ETag"), equalTo(etag))
        assertThat(notModified.response.getHeader("Cache-Control"), equalTo("no-cache"))
        assertThat(index.lastFilter, nullValue())

        val post = perform(
            post("/test/sample/details").contentType(MediaType.APPLICATION_JSON).content("{}")
                .header("If-None-Match", etag),
        )
        assertThat(post.response.status, equalTo(304))
    }

    @Test
    fun `the ETag differs by request, content encoding and index state`() {
        fun etag(builder: RequestBuilder) = perform(builder).response.getHeader("ETag")
        val plain = etag(get("/test/sample/details"))
        parsed = { QueryRequest(it, limit = 10) }
        val limited = etag(get("/test/sample/details"))
        val gzip = etag(get("/test/sample/details").header("Accept-Encoding", "gzip"))
        index.token = "next"
        val updated = etag(get("/test/sample/details"))
        assertThat(setOf(plain, limited, gzip, updated).size, equalTo(4))

        val stale = perform(get("/test/sample/details").header("If-None-Match", limited!!))
        assertThat(stale.response.status, equalTo(200))
    }

    @Test
    fun `no ETag for an unseeded random order, nor when the index changed while the query ran`() {
        parsed = { QueryRequest(it, random = RandomOrder(null)) }
        assertThat(perform(get("/test/sample/details")).response.getHeader("ETag"), nullValue())

        parsed = { QueryRequest(it) }
        index.onEvaluate = { index.token = "changed-during-query" }
        val result = perform(get("/test/sample/details"))
        assertThat(result.response.status, equalTo(200))
        assertThat(result.response.getHeader("ETag"), nullValue())
        assertThat(result.response.getHeader("Cache-Control"), equalTo("no-cache"))
    }
}

class LapisParamsTest {
    @Test
    fun `content negotiation`() {
        assertThat(LapisParams.dataFormatFromAccept(null, Endpoint.DETAILS), nullValue())
        assertThat(LapisParams.dataFormatFromAccept("application/json, text/plain, */*", Endpoint.DETAILS), nullValue())
        assertThat(
            LapisParams.dataFormatFromAccept("text/csv;headers=false", Endpoint.DETAILS),
            equalTo("csv-without-headers"),
        )
        assertThat(LapisParams.dataFormatFromAccept("text/tab-separated-values", Endpoint.AGGREGATED), equalTo("tsv"))
        assertThat(
            LapisParams.dataFormatFromAccept("text/csv;q=0.5, text/tab-separated-values", Endpoint.AGGREGATED),
            equalTo("tsv"),
        )
        assertThat(
            LapisParams.dataFormatFromAccept("application/json", Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES),
            equalTo("json"),
        )
        assertThat(
            LapisParams.dataFormatFromAccept("text/html,*/*;q=0.8", Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES),
            nullValue(),
        )
        assertThrows<LapisNotAcceptableException> {
            LapisParams.dataFormatFromAccept("text/csv", Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES)
        }
    }

    @Test
    fun `accept encoding prefers zstd`() {
        assertThat(LapisParams.contentEncodingFromAcceptEncoding("gzip, deflate, br, zstd"), equalTo("zstd"))
        assertThat(LapisParams.contentEncodingFromAcceptEncoding("gzip"), equalTo("gzip"))
        assertThat(LapisParams.contentEncodingFromAcceptEncoding("zstd;q=0, gzip"), equalTo("gzip"))
        assertThat(LapisParams.contentEncodingFromAcceptEncoding("br"), equalTo("br"))
        assertThat(LapisParams.contentEncodingFromAcceptEncoding("gzip, deflate, br"), equalTo("br"))
        assertThat(LapisParams.contentEncodingFromAcceptEncoding("gzip, deflate, br;q=0"), equalTo("gzip"))
        assertThat(LapisParams.contentEncodingFromAcceptEncoding(null), nullValue())
    }
}
