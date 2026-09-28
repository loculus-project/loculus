package org.loculus.backend.query.api

import com.fasterxml.jackson.core.JsonEncoding
import com.github.luben.zstd.ZstdOutputStream
import io.swagger.v3.oas.annotations.Hidden
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import mu.KotlinLogging
import org.apache.coyote.CloseNowException
import org.loculus.backend.query.QuerySchemaRegistry
import org.loculus.backend.query.index.OrganismIndex
import org.loculus.backend.query.index.OrganismIndexProvider
import org.loculus.backend.query.request.Compression
import org.loculus.backend.query.request.Endpoint
import org.loculus.backend.query.request.LapisRequestParser
import org.loculus.backend.query.request.QueryBadRequestException
import org.loculus.backend.query.request.QueryRequest
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.store.QueryStore
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Component
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestMethod
import org.springframework.web.bind.annotation.RestController
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.OutputStream
import java.net.URLEncoder
import java.util.zip.GZIPOutputStream

private val log = KotlinLogging.logger {}

const val LAPIS_DATA_VERSION_HEADER = "Lapis-Data-Version"

/** Seam for the request parser (tests use hand-built [QueryRequest]s). */
fun interface QueryRequestParser {
    fun parse(
        schema: QuerySchema,
        endpoint: Endpoint,
        pathSequenceName: String?,
        params: Map<String, List<Any?>>,
        isGet: Boolean,
    ): QueryRequest
}

@Component
@ConditionalOnProperty(prefix = "loculus.query-engine", name = ["enabled"], havingValue = "true")
class DefaultQueryRequestParser : QueryRequestParser {
    override fun parse(
        schema: QuerySchema,
        endpoint: Endpoint,
        pathSequenceName: String?,
        params: Map<String, List<Any?>>,
        isGet: Boolean,
    ) = LapisRequestParser.parse(schema, endpoint, pathSequenceName, params, isGet)
}

/**
 * LAPIS-compatible query API served at /{organism}/sample/... (the website points its LAPIS URL at
 * http://<backend>/<organism>).
 */
@Hidden
@RestController
@ConditionalOnProperty(prefix = "loculus.query-engine", name = ["enabled"], havingValue = "true")
class LapisQueryController(
    private val schemas: QuerySchemaRegistry,
    private val indexProvider: OrganismIndexProvider,
    private val parser: QueryRequestParser,
    store: QueryStore,
) {
    private val executor = LapisQueryExecutor(store)
    private val endpointsByRoute = Endpoint.entries.associateBy { it.routeName }

    @RequestMapping(
        value = ["/{organism}/sample/{route}", "/{organism}/sample/{route}/{sequenceName}"],
        method = [RequestMethod.GET, RequestMethod.POST],
    )
    fun query(
        @PathVariable organism: String,
        @PathVariable route: String,
        @PathVariable(required = false) sequenceName: String?,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        val schema = schema(organism)
        val endpoint = endpointsByRoute[route] ?: throw notFound(request)
        if (sequenceName != null) validateSequenceRoute(schema, endpoint, sequenceName, request)
        val index = index(organism)

        val isJson = request.method == "POST" && !isForm(request.contentType)
        val params = if (isJson) {
            LapisParams.fromJson(
                request.inputStream,
            )
        } else {
            LapisParams.fromParameterMap(request.parameterMap)
        }
        val withFormat = if (params.keys.none { it.equals("dataFormat", ignoreCase = true) }) {
            LapisParams.dataFormatFromAccept(request.getHeader(HttpHeaders.ACCEPT), endpoint)
                ?.let { params + ("dataFormat" to listOf(it)) } ?: params
        } else {
            params
        }
        val tStart = System.nanoTime()
        val parsed = parser.parse(schema, endpoint, sequenceName, withFormat, !isJson)
        val tParsed = System.nanoTime()

        val dataVersion = index.dataVersion.toString()
        val requestId = requestId(response)
        val info = { LapisInfo.create(dataVersion, requestId, schema.instanceName, request.serverName) }
        val body = executor.execute(organism, index, parsed, info)
        val tExecuted = System.nanoTime()

        val contentEncoding = if (parsed.compression == null && !parsed.downloadAsFile) {
            LapisParams.contentEncodingFromAcceptEncoding(request.getHeader(HttpHeaders.ACCEPT_ENCODING))
        } else {
            null
        }
        val headers = responseHeaders(parsed, endpoint, body, dataVersion, contentEncoding)

        // Responses are written on the servlet thread, not via StreamingResponseBody: the async dispatch raced with
        // Spring Security's header writer (occasionally duplicated security headers) and adds latency.
        val serverTiming = "parse;dur=${ms(tParsed - tStart)}, execute;dur=${ms(tExecuted - tParsed)}"
        val startResponse = { timing: String ->
            response.status = HttpStatus.OK.value()
            headers.forEach { name, values -> values.forEach { response.addHeader(name, it) } }
            response.addHeader("Server-Timing", timing)
        }

        if (body.buffered) {
            // rendered completely before anything is sent, so that a failure is still an error response
            val buffer = ByteArrayOutputStream()
            compress(buffer, parsed.compression, contentEncoding).use { body.write(it) }
            startResponse("$serverTiming, render;dur=${ms(System.nanoTime() - tExecuted)}")
            response.setContentLength(buffer.size())
            buffer.writeTo(response.outputStream)
            response.outputStream.flush()
            return
        }

        stream(body, request, response, parsed.compression, contentEncoding) { startResponse(serverTiming) }
    }

    /**
     * Streams [body]. Status and headers are only set when the first bytes leave the output buffer, so a failure
     * before that is still answered with an error status (by [LapisExceptionHandler]). A failure after that aborts
     * the connection: the chunked encoding is never terminated (and a compressed body never finished), so clients
     * see an incomplete transfer instead of a short, well-formed 200.
     */
    private fun stream(
        body: LapisBody,
        request: HttpServletRequest,
        response: HttpServletResponse,
        compression: Compression?,
        contentEncoding: String?,
        startResponse: () -> Unit,
    ) {
        val client = ClientOutputStream(response.outputStream)
        val deferred = DeferredOutputStream {
            startResponse()
            compress(client, compression, contentEncoding)
        }
        try {
            val out = BufferedOutputStream(deferred, OUTPUT_BUFFER_SIZE)
            body.write(out)
            out.close()
        } catch (e: Exception) {
            // never close or flush the response on failure: that would finish it cleanly
            client.detach()
            deferred.release()
            when {
                client.failed -> {
                    log.warn { "Query engine: client went away while streaming ${request.requestURI}: $e" }
                    throw e
                }

                !deferred.started -> throw e

                else -> {
                    log.error(e) {
                        "Query engine: ${request.method} ${request.requestURI}" +
                            (request.queryString?.let { "?$it" } ?: "") +
                            " (request id ${requestId(response)}) failed after the response started, " +
                            "aborting the connection: $e"
                    }
                    // commit what is buffered (status line and headers at least), so that the abort is visible
                    runCatching { response.flushBuffer() }
                    // Tomcat closes the connection for an exception from a committed response; this one is only
                    // logged at debug level by Tomcat (the failure has been logged above)
                    throw CloseNowException("response aborted after a failure: $e", e)
                }
            }
        }
    }

    @GetMapping("/{organism}/sample/info", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun info(
        @PathVariable organism: String,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): ResponseEntity<ByteArray> {
        val schema = schema(organism)
        val index = index(organism)
        val info = LapisInfo.create(
            index.dataVersion.toString(),
            requestId(response),
            schema.instanceName,
            request.serverName,
        )
        val out = ByteArrayOutputStream()
        lapisJsonFactory.createGenerator(out, JsonEncoding.UTF8).use { info.write(it) }
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_TYPE, LapisContentTypes.JSON)
            .header(LAPIS_DATA_VERSION_HEADER, index.dataVersion.toString())
            .body(out.toByteArray())
    }

    @GetMapping("/{organism}/sample/lineageDefinition/{column}")
    fun lineageDefinition(@PathVariable organism: String, @PathVariable column: String): ResponseEntity<ByteArray> {
        val schema = schema(organism)
        val system = schema.metadata.firstOrNull { it.name == column }?.lineageSystem
        val definition = system?.let { schema.lineageDefinitions[it] }
            ?: throw QueryBadRequestException(
                "Error from SILO: The column $column does not have a lineageIndex defined.",
            )
        val out = ByteArrayOutputStream()
        lapisJsonFactory.createGenerator(out, JsonEncoding.UTF8).use { g ->
            g.writeStartObject()
            for ((name, node) in definition.nodes) {
                g.writeFieldName(name)
                // roots are `{}` like LAPIS (the website's schema requires an object per node)
                g.writeStartObject()
                if (node.parents.isNotEmpty()) {
                    g.writeArrayFieldStart("parents")
                    node.parents.forEach(g::writeString)
                    g.writeEndArray()
                }
                if (node.aliases.isNotEmpty()) {
                    g.writeArrayFieldStart("aliases")
                    node.aliases.forEach(g::writeString)
                    g.writeEndArray()
                }
                g.writeEndObject()
            }
            g.writeEndObject()
        }
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_TYPE, LapisContentTypes.JSON).body(out.toByteArray())
    }

    private fun schema(organism: String): QuerySchema =
        schemas.get(organism) ?: throw LapisNotFoundException("Unknown organism: $organism")

    private fun index(organism: String): OrganismIndex = indexProvider.get(organism)
        ?: throw LapisUnavailableException(
            "The query engine for $organism is not available yet: the database is initializing. " +
                "Please try again later.",
        )

    private fun notFound(request: HttpServletRequest): LapisNotFoundException {
        val path = request.requestURI.substringAfter('/').substringAfter('/')
        return LapisNotFoundException("No static resource $path.")
    }

    /** /{route}/{name} only exists for real segments (multi-segmented organisms) and genes, spelled exactly */
    private fun validateSequenceRoute(
        schema: QuerySchema,
        endpoint: Endpoint,
        sequenceName: String,
        request: HttpServletRequest,
    ) {
        val exists = when (endpoint) {
            Endpoint.UNALIGNED_NUCLEOTIDE_SEQUENCES, Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES ->
                !schema.isSingleSegmented && schema.nucleotideSequences.any { it.name == sequenceName }

            Endpoint.ALIGNED_AMINO_ACID_SEQUENCES -> schema.genes.any { it.name == sequenceName }

            else -> false
        }
        if (!exists) throw notFound(request)
    }

    companion object {
        const val OUTPUT_BUFFER_SIZE = 64 * 1024

        private fun ms(nanos: Long) = "%.3f".format(nanos / 1e6)

        fun isForm(contentType: String?) =
            contentType != null && contentType.lowercase().startsWith(MediaType.APPLICATION_FORM_URLENCODED_VALUE)

        fun responseHeaders(
            request: QueryRequest,
            endpoint: Endpoint,
            body: LapisBody,
            dataVersion: String,
            contentEncoding: String?,
        ): HttpHeaders {
            val headers = HttpHeaders()
            headers.set(HttpHeaders.CONTENT_TYPE, request.compression?.contentType ?: body.contentType)
            headers.set(LAPIS_DATA_VERSION_HEADER, dataVersion)
            if (contentEncoding != null) headers.set(HttpHeaders.CONTENT_ENCODING, contentEncoding)
            if (request.downloadAsFile) {
                val basename = request.downloadFileBasename ?: endpoint.routeName
                val filename = "$basename.${body.fileExtension}" +
                    (request.compression?.let { ".${it.extension}" } ?: "")
                headers.set(HttpHeaders.CONTENT_DISPOSITION, contentDisposition(filename))
            }
            return headers
        }

        /** `attachment; filename=<ascii only>; filename*=UTF-8''<percent encoded>` like LAPIS */
        fun contentDisposition(filename: String): String {
            val ascii = filename.filter { it.code in 0x20..0x7e }
            val encoded = URLEncoder.encode(filename, Charsets.UTF_8).replace("+", "%20")
            return "attachment; filename=$ascii; filename*=UTF-8''$encoded"
        }

        fun compress(out: OutputStream, compression: Compression?, contentEncoding: String?): OutputStream = when {
            compression == Compression.GZIP || contentEncoding == "gzip" -> GZIPOutputStream(
                out,
                OUTPUT_BUFFER_SIZE,
            )

            compression == Compression.ZSTD || contentEncoding == "zstd" -> ZstdOutputStream(out, ZSTD_LEVEL)

            else -> out
        }

        private const val ZSTD_LEVEL = 3
    }
}

/** the response stream; remembers whether writing to the client failed, and can be detached (writes then dropped) */
private class ClientOutputStream(private val out: OutputStream) : OutputStream() {
    var failed = false
        private set
    private var detached = false

    fun detach() {
        detached = true
    }

    private inline fun io(block: () -> Unit) {
        if (detached) return
        try {
            block()
        } catch (e: IOException) {
            failed = true
            throw e
        }
    }

    override fun write(b: Int) = io { out.write(b) }

    override fun write(b: ByteArray, off: Int, len: Int) = io { out.write(b, off, len) }

    override fun flush() = io { out.flush() }

    override fun close() = io { out.close() }
}

/** creates its target on the first byte (or on close); flushing before that does nothing */
private class DeferredOutputStream(private val open: () -> OutputStream) : OutputStream() {
    private var target: OutputStream? = null
    val started get() = target != null

    private fun target(): OutputStream = target ?: open().also { target = it }

    override fun write(b: Int) = target().write(b)

    override fun write(b: ByteArray, off: Int, len: Int) = target().write(b, off, len)

    override fun flush() {
        target?.flush()
    }

    override fun close() = target().close()

    /** after a failure: frees the target (compressors hold native memory), its output must already be detached */
    fun release() {
        runCatching { target?.close() }
    }
}
