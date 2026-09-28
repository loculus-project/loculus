package org.loculus.backend.query.api

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.github.luben.zstd.ZstdInputStream
import io.mockk.every
import io.mockk.mockk
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.nullValue
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.controller.LoculusCustomHeaders
import org.loculus.backend.log.RequestIdContext
import org.loculus.backend.log.RequestIdFilter
import org.loculus.backend.query.QuerySchemaRegistry
import org.loculus.backend.query.index.OrganismIndex
import org.loculus.backend.query.index.OrganismIndexProvider
import org.loculus.backend.query.store.QueryStore
import org.loculus.backend.query.store.SequenceKind
import org.loculus.backend.query.store.SequenceRowConsumer
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.autoconfigure.ImportAutoConfiguration
import org.springframework.boot.http.converter.autoconfigure.HttpMessageConvertersAutoConfiguration
import org.springframework.boot.jackson2.autoconfigure.Jackson2AutoConfiguration
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.boot.tomcat.autoconfigure.servlet.TomcatServletWebServerAutoConfiguration
import org.springframework.boot.webmvc.autoconfigure.DispatcherServletAutoConfiguration
import org.springframework.boot.webmvc.autoconfigure.WebMvcAutoConfiguration
import org.springframework.boot.webmvc.autoconfigure.error.ErrorMvcAutoConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Import
import java.io.IOException
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.security.MessageDigest
import java.util.UUID

/** a store failure in the middle of the rows, like the database going away */
class SimulatedStoreFailure : RuntimeException("simulated store failure: the database went away")

/**
 * [FakeStore] that throws [SimulatedStoreFailure] after [failAfterChunks] metadata chunks (null: never); the
 * single-query read and sequences fail whenever [failAfterChunks] is set
 */
class FailingStore(private val delegate: FakeStore) : QueryStore by delegate {
    @Volatile
    var failAfterChunks: Int? = null

    override fun readMetadataFields(organism: String, ids: IntArray, fields: List<String>): List<Array<String?>> {
        if (failAfterChunks != null) throw SimulatedStoreFailure()
        return delegate.readMetadataFields(organism, ids, fields)
    }

    override fun streamSequenceRows(
        organism: String,
        kind: SequenceKind,
        sequenceIndices: List<Int>,
        ids: IntArray,
        fields: List<String>,
        consumer: SequenceRowConsumer,
    ) {
        if (failAfterChunks != null) throw SimulatedStoreFailure()
        delegate.streamSequenceRows(organism, kind, sequenceIndices, ids, fields, consumer)
    }

    override fun <T> streamMetadataFieldChunks(
        organism: String,
        ids: IntArray,
        fields: List<String>,
        render: (ids: IntArray, values: List<Array<String?>>) -> T,
        consumer: (T) -> Unit,
    ) {
        var chunks = 0
        delegate.streamMetadataFieldChunks(organism, ids, fields, render) { chunk ->
            failAfterChunks?.let { if (chunks++ >= it) throw SimulatedStoreFailure() }
            consumer(chunk)
        }
    }
}

/**
 * The query engine behind a real Tomcat (the bits of the backend that decide how a response ends: Spring MVC, the
 * LAPIS and global exception handlers, Boot's /error page, Tomcat compression), queried with a real HTTP client.
 */
@SpringBootTest(
    classes = [LapisHttpTest.App::class],
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = ["loculus.query-engine.enabled=true", "server.compression.enabled=true"],
)
class LapisHttpTest {
    @Suppress("DEPRECATION") // the backend uses Jackson 2 (spring-boot-jackson2) as well
    @Configuration(proxyBeanMethods = false)
    @ImportAutoConfiguration(
        TomcatServletWebServerAutoConfiguration::class,
        DispatcherServletAutoConfiguration::class,
        WebMvcAutoConfiguration::class,
        HttpMessageConvertersAutoConfiguration::class,
        Jackson2AutoConfiguration::class,
        ErrorMvcAutoConfiguration::class,
    )
    @Import(
        LapisQueryController::class,
        LapisExceptionHandler::class,
        org.loculus.backend.controller.ExceptionHandler::class,
        DefaultQueryRequestParser::class,
        RequestIdContext::class,
        RequestIdFilter::class,
    )
    class App {
        @Bean
        fun schemas(): QuerySchemaRegistry = mockk<QuerySchemaRegistry>().also { schemas ->
            every { schemas.get(any()) } returns null
            every { schemas.get("test") } returns SCHEMA
        }

        @Bean
        fun indexProvider() = object : OrganismIndexProvider {
            override fun get(organism: String): OrganismIndex = FakeIndex(SCHEMA, RECORDS.mapValues { emptyMap() })
        }

        @Bean
        fun store() = FailingStore(FakeStore(RECORDS))
    }

    @LocalServerPort
    private var port: Int = 0

    @Autowired
    private lateinit var store: FailingStore

    private val client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build()
    private val logs = ListAppender<ILoggingEvent>()
    private val rootLogger = LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME) as Logger

    @BeforeEach
    fun attachLogs() {
        logs.start()
        rootLogger.addAppender(logs)
    }

    @AfterEach
    fun detachLogs() {
        rootLogger.detachAppender(logs)
        store.failAfterChunks = null
    }

    private fun get(pathAndQuery: String, vararg headers: String): Pair<HttpResponse<java.io.InputStream>, String> {
        val requestId = UUID.randomUUID().toString()
        val request = HttpRequest.newBuilder(URI("http://localhost:$port$pathAndQuery"))
            .header(LoculusCustomHeaders.REQUEST_ID, requestId)
            .apply { if (headers.isNotEmpty()) headers(*headers) }
            .build()
        return client.send(request, HttpResponse.BodyHandlers.ofInputStream()) to requestId
    }

    private fun errorEvents(): List<ILoggingEvent> {
        // the server may still be logging when the client has seen the end of the response
        Thread.sleep(300)
        // request threads only (Tomcat's own error logging runs there too), not other contexts' background threads
        return logs.list.filter { it.level == Level.ERROR && it.threadName.startsWith("http-nio-") }
    }

    @Test
    fun `a revalidation with the ETag gets an empty 304 through Tomcat, for streamed and buffered responses`() {
        for (path in listOf(STREAMED_DOWNLOAD, "/test/sample/details?fields=accessionVersion,country&limit=100")) {
            val (first, _) = get(path, "Accept-Encoding", "gzip")
            first.body().use { it.readAllBytes() }
            assertThat(first.statusCode(), equalTo(200))
            val etag = first.headers().firstValue("ETag").orElseThrow()
            assertThat(first.headers().firstValue("Cache-Control").orElse(null), equalTo("no-cache"))

            val (second, _) = get(path, "Accept-Encoding", "gzip", "If-None-Match", etag)
            assertThat(second.statusCode(), equalTo(304))
            assertThat(second.body().use { it.readAllBytes() }.size, equalTo(0))
            assertThat(second.headers().firstValue("ETag").orElse(null), equalTo(etag))
        }
    }

    @Test
    fun `a streamed download that fails after the first bytes aborts the connection`() {
        store.failAfterChunks = FAIL_AFTER_CHUNKS
        val (response, requestId) = get(STREAMED_DOWNLOAD)
        assertThat(response.statusCode(), equalTo(200))
        val received = java.io.ByteArrayOutputStream()
        assertThrows<IOException> { response.body().use { it.transferTo(received) } }
        assertThat(String(received.toByteArray()), startsWith("accessionVersion\tcountry\n"))

        val errors = errorEvents()
        assertThat(errors.map { it.formattedMessage }.toString(), errors, hasSize(1))
        assertThat(errors.single().mdcPropertyMap["RequestId"], equalTo(requestId))
    }

    @Test
    fun `a small details response is a 500 LAPIS error when the store fails`() {
        store.failAfterChunks = 0
        val (response, _) = get(
            "/test/sample/details?fields=accessionVersion,country&limit=100",
            "Accept-Encoding",
            "zstd",
        )
        val body = response.body().use { it.readAllBytes() }.decodeToString()
        assertThat(response.statusCode(), equalTo(500))
        assertThat(response.headers().firstValue("Content-Encoding").orElse(null), nullValue())
        assertThat(body, startsWith("""{"error":{"detail":"simulated store failure"""))
        assertThat(errorEvents(), hasSize(1))
    }

    @Test
    fun `a streamed download that fails before its first byte is a 500 without download headers`() {
        store.failAfterChunks = 0
        val (response, _) = get(STREAMED_DOWNLOAD)
        val body = response.body().use { it.readAllBytes() }.decodeToString()
        assertThat(response.statusCode(), equalTo(500))
        assertThat(response.headers().firstValue("Content-Disposition").orElse(null), nullValue())
        assertThat(body, startsWith("""{"error":{"detail":"simulated store failure"""))
        assertThat(errorEvents(), hasSize(1))
    }

    @Test
    fun `a streamed JSON response that fails midway aborts the connection`() {
        store.failAfterChunks = FAIL_AFTER_CHUNKS
        val (response, _) = get("/test/sample/details?fields=accessionVersion,country&dataFormat=json")
        assertThat(response.statusCode(), equalTo(200))
        val received = java.io.ByteArrayOutputStream()
        // before the abort, Tomcat includes Boot's /error page into the committed response (for JSON it renders)
        assertThrows<IOException> { response.body().use { it.transferTo(received) } }
        assertThat(String(received.toByteArray()), startsWith("""{"data":[{"accessionVersion":"A0.1","""))
    }

    @Test
    fun `a small sequence response that fails before its first bytes is a 500`() {
        store.failAfterChunks = 0
        val (response, _) = get("/test/sample/unalignedNucleotideSequences?limit=1")
        val body = response.body().use { it.readAllBytes() }.decodeToString()
        assertThat(response.statusCode(), equalTo(500))
        assertThat(body, startsWith("""{"error":{"detail":"simulated store failure"""))
        assertThat(errorEvents(), hasSize(1))
    }

    @Test
    fun `a gzip download that fails midway is not a valid gzip file`() {
        store.failAfterChunks = FAIL_AFTER_CHUNKS
        val (response, _) = get("$STREAMED_DOWNLOAD&compression=gzip")
        assertThat(response.statusCode(), equalTo(200))
        assertThrows<IOException> { response.body().use { it.readAllBytes() } }
    }

    @Test
    fun `successful responses are complete`() {
        val (download, _) = get(STREAMED_DOWNLOAD)
        val text = download.body().use { it.readAllBytes() }.decodeToString()
        assertThat(download.statusCode(), equalTo(200))
        assertThat(text, equalTo(expectedTsv()))
        assertThat(
            download.headers().firstValue("Content-Disposition").orElse(null),
            equalTo("attachment; filename=details.tsv; filename*=UTF-8''details.tsv"),
        )

        val (small, _) = get("/test/sample/details?fields=accessionVersion&limit=2&dataFormat=csv")
        assertThat(small.statusCode(), equalTo(200))
        assertThat(small.body().use { it.readAllBytes() }.decodeToString(), equalTo("accessionVersion\nA0.1\nA1.1\n"))
    }

    /**
     * Status, the headers that matter and a digest of the exact body bytes of representative requests (small and
     * large details, all table formats, compressed and not). requestInfo contains the time, so JSON bodies with the
     * info envelope are compared decompressed, with request id and time masked.
     */
    @Test
    fun `successful responses are byte-identical to the reference`() {
        val actual = GOLDEN_REQUESTS.joinToString("\n") { (path, acceptEncoding) ->
            val (response, _) = if (acceptEncoding == null) get(path) else get(path, "Accept-Encoding", acceptEncoding)
            val header = { name: String -> response.headers().firstValue(name).orElse("-") }
            var bytes = response.body().use { it.readAllBytes() }
            if (path.contains("dataFormat=json") && !path.contains("downloadAsFile")) {
                if (acceptEncoding == "zstd") bytes = ZstdInputStream(bytes.inputStream()).readBytes()
                bytes = MASKED_INFO.replace(bytes.decodeToString(), "").toByteArray()
            }
            val digest = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
            listOfNotNull(
                "${path.removePrefix("/test/sample/")} [$acceptEncoding]",
                "  ${response.statusCode()} ${header("Content-Type")} encoding=${header("Content-Encoding")} " +
                    "version=${header(LAPIS_DATA_VERSION_HEADER)}",
                header("Content-Disposition").takeIf { it != "-" }?.let { "  $it" },
                "  ${bytes.size} bytes, sha256 ${digest.take(16)}",
            ).joinToString("\n")
        }
        assertThat(actual, equalTo(GOLDEN))
    }

    companion object {
        private val GOLDEN_REQUESTS = listOf(
            "/test/sample/details?fields=accessionVersion,country&limit=100&dataFormat=json" to null,
            "/test/sample/details?fields=accessionVersion,country&limit=100&dataFormat=json" to "zstd",
            "/test/sample/details?fields=accessionVersion,country&limit=100&dataFormat=csv" to null,
            "/test/sample/details?fields=accessionVersion,country&limit=100&dataFormat=tsv" to "zstd",
            "/test/sample/details?fields=accessionVersion,country&limit=1000&dataFormat=tsv-escaped" to "gzip",
            "/test/sample/details?limit=1000&dataFormat=csv-without-headers" to null,
            "/test/sample/details?fields=accessionVersion,country&limit=1001&dataFormat=tsv" to "zstd",
            "/test/sample/details?fields=accessionVersion,country&limit=5000&dataFormat=csv" to null,
            "/test/sample/details?fields=accessionVersion&limit=10&downloadAsFile=true" to null,
            "/test/sample/details?fields=accessionVersion,country&limit=10&dataFormat=tsv&downloadAsFile=true" +
                "&compression=gzip" to null,
            "/test/sample/details?fields=accessionVersion,country&dataFormat=tsv&downloadAsFile=true" +
                "&compression=zstd" to null,
            "/test/sample/details?fields=accessionVersion&downloadAsFile=true" to "zstd",
            "/test/sample/aggregated?fields=country&limit=3&dataFormat=csv" to null,
        )

        /** recorded before small responses were buffered: buffering must not change a byte */
        private val GOLDEN = listOf(
            "details?fields=accessionVersion,country&limit=100&dataFormat=json [null]",
            "  200 application/json encoding=- version=1234",
            "  14745 bytes, sha256 93d68b31b92bd9ae",
            "details?fields=accessionVersion,country&limit=100&dataFormat=json [zstd]",
            "  200 application/json encoding=zstd version=1234",
            "  14745 bytes, sha256 93d68b31b92bd9ae",
            "details?fields=accessionVersion,country&limit=100&dataFormat=csv [null]",
            "  200 text/csv;charset=UTF-8 encoding=- version=1234",
            "  11005 bytes, sha256 37276db22cd87551",
            "details?fields=accessionVersion,country&limit=100&dataFormat=tsv [zstd]",
            "  200 text/tab-separated-values;charset=UTF-8 encoding=zstd version=1234",
            "  381 bytes, sha256 ce03c91712a0ee04",
            "details?fields=accessionVersion,country&limit=1000&dataFormat=tsv-escaped [gzip]",
            "  200 text/tab-separated-values;charset=UTF-8 encoding=gzip version=1234",
            "  5442 bytes, sha256 b30d1d84d92a0e6d",
            "details?limit=1000&dataFormat=csv-without-headers [null]",
            "  200 text/plain encoding=- version=1234",
            "  116780 bytes, sha256 3a91352d784f8fe8",
            "details?fields=accessionVersion,country&limit=1001&dataFormat=tsv [zstd]",
            "  200 text/tab-separated-values;charset=UTF-8 encoding=zstd version=1234",
            "  2297 bytes, sha256 10defc170e53585e",
            "details?fields=accessionVersion,country&limit=5000&dataFormat=csv [null]",
            "  200 text/csv;charset=UTF-8 encoding=- version=1234",
            "  567805 bytes, sha256 d0977a22fb36a4da",
            "details?fields=accessionVersion&limit=10&downloadAsFile=true [null]",
            "  200 application/json encoding=- version=1234",
            "  attachment; filename=details.json; filename*=UTF-8''details.json",
            "  281 bytes, sha256 0825796e7731985d",
            "details?fields=accessionVersion,country&limit=10&dataFormat=tsv&downloadAsFile=true&compression=gzip [null]",
            "  200 application/gzip encoding=- version=1234",
            "  attachment; filename=details.tsv.gz; filename*=UTF-8''details.tsv.gz",
            "  110 bytes, sha256 d413a8d5ed72bb34",
            "details?fields=accessionVersion,country&dataFormat=tsv&downloadAsFile=true&compression=zstd [null]",
            "  200 application/zstd encoding=- version=1234",
            "  attachment; filename=details.tsv.zst; filename*=UTF-8''details.tsv.zst",
            "  34186 bytes, sha256 8a83a38b3e8c6cd0",
            "details?fields=accessionVersion&downloadAsFile=true [zstd]",
            "  200 application/json encoding=- version=1234",
            "  attachment; filename=details.json; filename*=UTF-8''details.json",
            "  628891 bytes, sha256 c0b7aa41fa713d35",
            "aggregated?fields=country&limit=3&dataFormat=csv [null]",
            "  200 text/csv;charset=UTF-8 encoding=- version=1234",
            "  14 bytes, sha256 a4f12600296cb1c0",
        ).joinToString("\n")
        private val MASKED_INFO = Regex("\"(requestId|requestInfo)\":\"[^\"]*\"")
        private const val N = 20_000
        private const val STREAMED_DOWNLOAD = "/test/sample/details?fields=accessionVersion,country" +
            "&dataFormat=tsv&downloadAsFile=true"

        /** FakeStore chunks are 2 rows of ~110 bytes: fail after ~1.1 MB, well past any buffer */
        private const val FAIL_AFTER_CHUNKS = 5_000
        private val PADDING = "x".repeat(100)
        private val SCHEMA = testSchema()
        private val RECORDS: Map<Int, String> = (0 until N).associateWith {
            """{"accessionVersion":"A$it.1","country":"C$it$PADDING"}"""
        }

        fun expectedTsv() = "accessionVersion\tcountry\n" +
            (0 until N).joinToString("") { "A$it.1\tC$it$PADDING\n" }
    }
}
