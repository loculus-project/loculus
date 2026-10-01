package org.loculus.backend.query.api

import com.github.luben.zstd.ZstdInputStream
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import io.mockk.every
import io.mockk.mockk
import jakarta.servlet.Filter
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.not
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.io.TempDir
import org.loculus.backend.controller.LoculusCustomHeaders
import org.loculus.backend.query.QuerySchemaRegistry
import org.loculus.backend.query.cache.ResponseCache
import org.loculus.backend.query.cache.ResponseCacheProperties
import org.loculus.backend.query.index.AggregatedRow
import org.loculus.backend.query.index.MutationRow
import org.loculus.backend.query.index.OrganismIndex
import org.loculus.backend.query.index.OrganismIndexProvider
import org.loculus.backend.query.store.SequenceKind
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.util.unit.DataSize
import java.nio.file.Path
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.zip.GZIPInputStream
import kotlin.io.path.listDirectoryEntries

/** the controller with a real [ResponseCache]: what a miss, a memory hit and a disk hit send */
class LapisResponseCacheTest {
    @TempDir
    lateinit var dir: Path

    private val schema = testSchema()
    private val records = (0 until 20).associateWith { """{"accessionVersion":"A$it.1","country":"C$it","age":$it}""" }
    private val index = FakeIndex(
        schema,
        records.mapValues { emptyMap() },
        aggregateResult = listOf(AggregatedRow(listOf("CH"), 3), AggregatedRow(listOf("DE"), 5)),
        mutationResult = listOf(MutationRow(0, 2, 'C', 'T', 5, 10)),
    )
    private var evaluations = 0
    private val meters = SimpleMeterRegistry()
    private val caches = mutableListOf<ResponseCache>()

    init {
        index.onEvaluate = { evaluations++ }
    }

    @AfterEach
    fun close() = caches.forEach(ResponseCache::close)

    private fun cache(memory: Long, disk: Long) = ResponseCache(
        ResponseCacheProperties(
            memorySize = DataSize.ofBytes(memory),
            diskSize = DataSize.ofBytes(disk),
            diskPath = if (disk > 0) dir.toString() else null,
        ),
        meters,
        diskExecutor = { it.run() },
        scheduleSweeps = false,
    ).also { caches.add(it) }

    private fun mockMvc(cache: ResponseCache?, store: FailingStore = storeWithSequences()): MockMvc {
        val schemas = mockk<QuerySchemaRegistry>()
        every { schemas.get(any()) } returns null
        every { schemas.get("test") } returns schema
        val provider = object : OrganismIndexProvider {
            override fun get(organism: String): OrganismIndex = index
        }
        val controller = LapisQueryController(schemas, provider, DefaultQueryRequestParser(), store, cache)
        controller.clock = Clock.fixed(Instant.parse("2026-09-28T12:00:00Z"), ZoneOffset.UTC)
        // what RequestIdFilter does in the backend
        val requestIds = Filter { request, response, chain ->
            val id = (request as HttpServletRequest).getHeader("test-request-id") ?: "fixed-id"
            (response as HttpServletResponse).setHeader(LoculusCustomHeaders.REQUEST_ID, id)
            chain.doFilter(request, response)
        }
        return MockMvcBuilders.standaloneSetup(controller)
            .setControllerAdvice(LapisExceptionHandler(schemas))
            .addFilters<org.springframework.test.web.servlet.setup.StandaloneMockMvcBuilder>(requestIds)
            .build()
    }

    private fun storeWithSequences() = FailingStore(
        FakeStore(
            records,
            records.keys.associate { Triple(SequenceKind.UNALIGNED_NUCLEOTIDE, 0, it) to "ACGT".repeat(50 + it) },
        ),
    )

    private fun MockMvc.send(request: MockHttpServletRequestBuilder): MockHttpServletResponse =
        perform(request).andReturn().response

    private val requests: List<Pair<String, () -> MockHttpServletRequestBuilder>> = listOf(
        "aggregated JSON (spliced info)" to {
            post("/test/sample/aggregated").contentType("application/json").content("""{"fields":["country"]}""")
        },
        "details JSON, sequence page" to {
            post("/test/sample/details").contentType("application/json")
                .content("""{"accessionVersion":"A1.1","fields":["accessionVersion","country"]}""")
        },
        "details CSV" to { get("/test/sample/details?fields=accessionVersion,age&dataFormat=csv&limit=10") },
        "mutations" to { get("/test/sample/nucleotideMutations?minProportion=0.05") },
        "FASTA (streamed)" to { get("/test/sample/unalignedNucleotideSequences?accessionVersion=A1.1") },
        "TSV download (streamed)" to {
            get("/test/sample/details?fields=accessionVersion,country&dataFormat=tsv&downloadAsFile=true")
        },
    )

    private fun decode(response: MockHttpServletResponse): String {
        val bytes = response.contentAsByteArray
        return when (response.getHeader("Content-Encoding")) {
            "gzip" -> GZIPInputStream(bytes.inputStream()).use { String(it.readAllBytes()) }
            "zstd" -> ZstdInputStream(bytes.inputStream()).use { String(it.readAllBytes()) }
            else -> String(bytes)
        }
    }

    private fun headersOf(response: MockHttpServletResponse) = listOf(
        "Content-Type",
        "Content-Encoding",
        "Content-Disposition",
        "ETag",
        "Lapis-Data-Version",
        "Cache-Control",
        "Vary",
    ).associateWith { response.getHeaders(it) }

    private fun assertSameAcrossTiers(tier: String, cache: ResponseCache) {
        val mockMvc = mockMvc(cache)
        for ((name, request) in requests) {
            for (encoding in listOf(null, "gzip", "zstd")) {
                val label = "$name, ${encoding ?: "identity"}, $tier"
                val build = { request().apply { if (encoding != null) header("Accept-Encoding", encoding) } }
                val first = mockMvc.send(build())
                val second = mockMvc.send(build())
                val before = evaluations
                val hit = mockMvc.send(build())

                assertThat(label, first.status, equalTo(200))
                assertThat(label, hit.getHeader("Server-Timing"), containsString("cache;desc=\"$tier\""))
                assertThat("$label: a hit does not touch the index", evaluations, equalTo(before))
                assertThat(label, second.contentAsByteArray.toList(), equalTo(first.contentAsByteArray.toList()))
                assertThat(label, hit.contentAsByteArray.toList(), equalTo(first.contentAsByteArray.toList()))
                assertThat(label, headersOf(hit), equalTo(headersOf(first)))
                assertThat(label, hit.contentLength.toLong(), equalTo(first.contentAsByteArray.size.toLong()))
                assertThat(label, decode(hit), not(equalTo("")))
            }
        }
    }

    @Test
    fun `a GET with orderBy field-descending equals the JSON POST in bytes and ETag`() {
        val mockMvc = mockMvc(cache = null)
        // the search table's shape: columns, a filter, the default descending sort, one page
        val searchTableGet = "/test/sample/details?fields=country&fields=accessionVersion&fields=age" +
            "&isRevocation=false&orderBy=age:descending&limit=100&offset=0"
        for (encoding in listOf(null, "gzip")) {
            val getResponse = mockMvc.send(
                get(searchTableGet)
                    .apply { if (encoding != null) header("Accept-Encoding", encoding) },
            )
            val postResponse = mockMvc.send(
                post("/test/sample/details").contentType("application/json")
                    .content(
                        """{"fields":["country","accessionVersion","age"],"isRevocation":false,""" +
                            """"orderBy":[{"field":"age","type":"descending"}],"limit":100,"offset":0}""",
                    )
                    .apply { if (encoding != null) header("Accept-Encoding", encoding) },
            )
            assertThat(getResponse.status, equalTo(200))
            assertThat(getResponse.getHeader("ETag"), equalTo(postResponse.getHeader("ETag")))
            assertThat(getResponse.contentAsByteArray.toList(), equalTo(postResponse.contentAsByteArray.toList()))
            // FakeIndex does not sort; the parser tests show both spellings parse to the same request
            assertThat(decode(getResponse), containsString("\"accessionVersion\""))

            val revalidated = mockMvc.send(
                get(searchTableGet)
                    .header("If-None-Match", postResponse.getHeader("ETag")!!)
                    .apply { if (encoding != null) header("Accept-Encoding", encoding) },
            )
            assertThat(revalidated.status, equalTo(304))
        }
        val ascending = mockMvc.send(get("/test/sample/details?fields=accessionVersion,age&orderBy=age&limit=5"))
        val descending = mockMvc.send(
            get("/test/sample/details?fields=accessionVersion,age&orderBy=age:descending&limit=5"),
        )
        assertThat(ascending.getHeader("ETag"), not(equalTo(descending.getHeader("ETag"))))
    }

    @Test
    fun `a miss, a memory hit and a disk hit send the same bytes`() {
        assertSameAcrossTiers("memory", cache(memory = 10_000_000, disk = 0))
    }

    @Test
    fun `a disk hit sends the same bytes as the miss`() {
        assertSameAcrossTiers("disk", cache(memory = 0, disk = 10_000_000))
        assertThat(dir.listDirectoryEntries().none { it.fileName.toString().startsWith("tmp") }, equalTo(true))
    }

    @Test
    fun `the info object is fresh on every hit`() {
        val mockMvc = mockMvc(cache(memory = 10_000_000, disk = 0))
        val request = { id: String ->
            get(
                "/test/sample/aggregated?fields=country",
            ).header("test-request-id", id).header("Accept-Encoding", "gzip")
        }
        mockMvc.send(request("one"))
        mockMvc.send(request("two"))
        val hit = mockMvc.send(request("three"))
        assertThat(hit.getHeader("Server-Timing"), containsString("cache"))
        assertThat(decode(hit), containsString("\"requestId\":\"three\""))
        assertThat(decode(hit), containsString("\"data\":[{\"count\":3,\"country\":\"CH\"}"))
    }

    @Test
    fun `a revalidation is answered before the cache and the index`() {
        val mockMvc = mockMvc(cache(memory = 10_000_000, disk = 0))
        val first = mockMvc.send(get("/test/sample/aggregated?fields=country"))
        val before = evaluations
        val revalidated = mockMvc.send(
            get("/test/sample/aggregated?fields=country").header("If-None-Match", first.getHeader("ETag")!!),
        )
        assertThat(revalidated.status, equalTo(304))
        assertThat(revalidated.contentAsByteArray.size, equalTo(0))
        assertThat(evaluations, equalTo(before))
    }

    @Test
    fun `hits report the database work they avoided`() {
        val mockMvc = mockMvc(cache(memory = 10_000_000, disk = 0))
        repeat(3) { mockMvc.send(get("/test/sample/details?fields=accessionVersion,country&limit=10")) }
        assertThat(meters.find("loculus.query.cache.saved.db.rows").counter()!!.count(), equalTo(10.0))
        assertThat(meters.find("loculus.query.cache.saved.db.bytes").counter()!!.count(), greaterThan(0.0))
    }

    @Test
    fun `a response computed while the index changed is not cached`() {
        val cache = cache(memory = 10_000_000, disk = 0)
        val mockMvc = mockMvc(cache)
        var generation = 0
        index.onEvaluate = { index.token = "moving-${generation++}" }
        repeat(3) {
            val response = mockMvc.send(get("/test/sample/aggregated?fields=country"))
            assertThat(response.getHeader("ETag"), nullValue())
        }
        assertThat(cache.memory.size(), equalTo(0))
    }

    @Test
    fun `a stream that fails leaves no entry and no file`() {
        val cache = cache(memory = 100_000, disk = 100_000_000)
        val bigRecords = (0 until 20_000).associateWith {
            """{"accessionVersion":"A$it.1","country":"C$it${"x".repeat(100)}"}"""
        }
        val store = FailingStore(FakeStore(bigRecords))
        val bigIndex = FakeIndex(schema, bigRecords.mapValues { emptyMap() })
        val schemas = mockk<QuerySchemaRegistry>()
        every { schemas.get("test") } returns schema
        val controller = LapisQueryController(
            schemas,
            object : OrganismIndexProvider {
                override fun get(organism: String): OrganismIndex = bigIndex
            },
            DefaultQueryRequestParser(),
            store,
            cache,
        )
        val mockMvc = MockMvcBuilders.standaloneSetup(
            controller,
        ).setControllerAdvice(LapisExceptionHandler(schemas)).build()
        val download = "/test/sample/details?fields=accessionVersion,country&dataFormat=tsv&downloadAsFile=true"

        store.failAfterChunks = 1_000
        repeat(3) { assertThrows<Exception> { mockMvc.perform(get(download)).andReturn() } }
        assertThat(cache.memory.size() + cache.disk.size(), equalTo(0))
        assertThat(dir.listDirectoryEntries(), empty())

        store.failAfterChunks = null
        val complete = mockMvc.send(get(download))
        assertThat(complete.status, equalTo(200))
        assertThat(cache.disk.size(), equalTo(1))
        val hit = mockMvc.send(get(download))
        assertThat(hit.getHeader("Server-Timing"), containsString("cache;desc=\"disk\""))
        assertThat(hit.contentAsByteArray.toList(), equalTo(complete.contentAsByteArray.toList()))
    }

    @Test
    fun `without a cache the controller behaves as before`() {
        val mockMvc = mockMvc(null)
        repeat(2) {
            val response = mockMvc.send(get("/test/sample/aggregated?fields=country"))
            assertThat(response.getHeader("Server-Timing"), not(containsString("cache")))
        }
    }
}
