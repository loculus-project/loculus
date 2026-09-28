package org.loculus.backend.query.api

import com.fasterxml.jackson.core.JsonEncoding
import com.github.luben.zstd.ZstdOutputStream
import io.swagger.v3.oas.annotations.Hidden
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import mu.KotlinLogging
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
        response.status = HttpStatus.OK.value()
        headers.forEach { name, values -> values.forEach { response.addHeader(name, it) } }

        if (endpoint in BOUNDED_ENDPOINTS) {
            // bounded (counts, aggregations, mutation/insertion lists): rendered first, sent with Content-Length
            val buffer = ByteArrayOutputStream()
            compress(buffer, parsed.compression, contentEncoding).use { body.write(it) }
            response.addHeader("Server-Timing", "$serverTiming, render;dur=${ms(System.nanoTime() - tExecuted)}")
            response.setContentLength(buffer.size())
            buffer.writeTo(response.outputStream)
            response.outputStream.flush()
            return
        }

        response.addHeader("Server-Timing", serverTiming)
        try {
            val compressed = compress(response.outputStream, parsed.compression, contentEncoding)
            BufferedOutputStream(compressed, OUTPUT_BUFFER_SIZE).use { out -> body.write(out) }
        } catch (e: Exception) {
            log.warn(e) { "Query engine: streaming ${request.requestURI} aborted: $e" }
            throw e
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

        private val BOUNDED_ENDPOINTS = setOf(
            Endpoint.AGGREGATED,
            Endpoint.NUCLEOTIDE_MUTATIONS,
            Endpoint.AMINO_ACID_MUTATIONS,
            Endpoint.NUCLEOTIDE_INSERTIONS,
            Endpoint.AMINO_ACID_INSERTIONS,
        )

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
