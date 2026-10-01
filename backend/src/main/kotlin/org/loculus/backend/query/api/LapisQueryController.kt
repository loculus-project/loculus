package org.loculus.backend.query.api

import com.fasterxml.jackson.core.JsonEncoding
import io.swagger.v3.oas.annotations.Hidden
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import mu.KotlinLogging
import org.apache.coyote.CloseNowException
import org.loculus.backend.query.QuerySchemaRegistry
import org.loculus.backend.query.cache.CacheKey
import org.loculus.backend.query.cache.CachedResponse
import org.loculus.backend.query.cache.InfoSplice
import org.loculus.backend.query.cache.MissCost
import org.loculus.backend.query.cache.ResponseCache
import org.loculus.backend.query.cache.WireCodec
import org.loculus.backend.query.index.IndexLookup
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
import java.time.Clock

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
    private val store: QueryStore,
    private val cache: ResponseCache? = null,
) {
    private val executor = LapisQueryExecutor(store)

    /** the time in responses' requestInfo (tests fix it to compare bodies byte for byte) */
    internal var clock: Clock = Clock.systemUTC()
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
        val contentEncoding = if (parsed.compression == null && !parsed.downloadAsFile) {
            LapisParams.contentEncodingFromAcceptEncoding(request.getHeader(HttpHeaders.ACCEPT_ENCODING))
        } else {
            null
        }
        val contentToken = index.contentToken
        val requestHash = requestHash(organism, sequenceName, parsed, contentEncoding)
        val etag = requestHash?.let { entityTag(dataVersion, contentToken, it) }
        if (etag != null && ifNoneMatchMatches(request.getHeader(HttpHeaders.IF_NONE_MATCH), etag)) {
            // answered before the query runs; also for POST (see entityTag)
            response.status = HttpStatus.NOT_MODIFIED.value()
            response.setHeader(HttpHeaders.ETAG, etag)
            response.setHeader(HttpHeaders.CACHE_CONTROL, cacheControl(parsed))
            response.setHeader(LAPIS_DATA_VERSION_HEADER, dataVersion)
            response.addHeader(HttpHeaders.VARY, VARY)
            return
        }

        val requestId = requestId(response)
        val info = { LapisInfo.create(dataVersion, requestId, schema.instanceName, request.serverName, clock) }
        val serverTimingParse = "parse;dur=${ms(tParsed - tStart)}"

        val key = if (cache != null && cache.enabled && requestHash != null) {
            CacheKey(organism, contentToken, requestHash)
        } else {
            null
        }
        if (cache != null && key != null) {
            val cached = Cached(cache, key, index, parsed, endpoint, dataVersion, etag!!, contentEncoding, info)
            cache.lookup(key)?.let { hit ->
                serveCached(
                    response,
                    hit.response,
                    hit.open(),
                    "$serverTimingParse, cache;desc=\"${hit.tier}\"",
                    cached,
                )
                return
            }
            when (val flight = cache.beginFlight(key)) {
                is ResponseCache.Flight.Follower -> {
                    val shared = cache.await(flight)
                    if (shared != null) {
                        val timing = "$serverTimingParse, cache;desc=\"single-flight\""
                        serveCached(response, shared.response, shared.body.inputStream(), timing, cached)
                        return
                    }
                    cache.lookup(key, sighting = false)?.let { hit ->
                        val timing = "$serverTimingParse, cache;desc=\"${hit.tier}\""
                        serveCached(response, hit.response, hit.open(), timing, cached)
                        return
                    }
                    executeCacheable(cached, null, request, response, tParsed, serverTimingParse)
                }

                is ResponseCache.Flight.Leader -> {
                    var shared: ResponseCache.Shared? = null
                    try {
                        shared = executeCacheable(cached, flight, request, response, tParsed, serverTimingParse)
                    } finally {
                        cache.finish(flight, shared)
                    }
                }
            }
            return
        }

        val body = executor.execute(organism, index, parsed, info)
        val tExecuted = System.nanoTime()

        val headers = responseHeaders(parsed, endpoint, body, dataVersion, contentEncoding)
        headers.set(HttpHeaders.CACHE_CONTROL, cacheControl(parsed))
        headers.add(HttpHeaders.VARY, VARY)
        // an index update while the query ran may have mixed two states into the body: send no validator then
        if (etag != null && index.contentToken == contentToken) headers.set(HttpHeaders.ETAG, etag)

        // Responses are written on the servlet thread, not via StreamingResponseBody: the async dispatch raced with
        // Spring Security's header writer (occasionally duplicated security headers) and adds latency.
        val serverTiming = "$serverTimingParse, execute;dur=${ms(tExecuted - tParsed)}"
        val startResponse = { timing: String ->
            response.status = HttpStatus.OK.value()
            headers.forEach { name, values -> values.forEach { response.addHeader(name, it) } }
            response.addHeader("Server-Timing", timing)
        }

        if (body.buffered) {
            // rendered completely before anything is sent, so that a failure is still an error response
            val buffer = ByteArrayOutputStream()
            compress(buffer, parsed.compression, contentEncoding, endpoint.isSequenceEndpoint).use { body.write(it) }
            startResponse("$serverTiming, render;dur=${ms(System.nanoTime() - tExecuted)}")
            response.setContentLength(buffer.size())
            buffer.writeTo(response.outputStream)
            response.outputStream.flush()
            return
        }

        stream(body, request, response, parsed.compression, contentEncoding, endpoint.isSequenceEndpoint, tee = null) {
            startResponse(serverTiming)
        }
    }

    /** what serving a request through the cache needs */
    private class Cached(
        val cache: ResponseCache,
        val key: CacheKey,
        val index: OrganismIndex,
        val parsed: QueryRequest,
        val endpoint: Endpoint,
        val dataVersion: String,
        val etag: String,
        val contentEncoding: String?,
        val info: () -> LapisInfo,
    ) {
        val codec = when (parsed.compression) {
            Compression.GZIP -> WireCodec.GZIP
            Compression.ZSTD -> WireCodec.ZSTD
            null -> WireCodec.of(contentEncoding)
        }
    }

    /**
     * A cache miss. A buffered body is rendered uncompressed first, split around its `info` object, and encoded
     * the way a hit is served ([WireCodec.encodePrefix] + [WireCodec.tail]), so a miss and later hits send the same
     * bytes. A streamed body is copied while it streams ([ResponseCache.Tee]) and offered only when it completed.
     * Offered only if the index did not change while the response was computed. Returns the response for identical
     * concurrent requests (buffered only).
     */
    private fun executeCacheable(
        cached: Cached,
        flight: ResponseCache.Flight.Leader?,
        request: HttpServletRequest,
        response: HttpServletResponse,
        tParsed: Long,
        serverTimingParse: String,
    ): ResponseCache.Shared? {
        val work = DbWork()
        val countingExecutor = LapisQueryExecutor(CountingQueryStore(store, work))
        val plain = ByteArrayOutputStream()
        var info: LapisInfo? = null
        var infoAt = -1
        var tee: ResponseCache.Tee? = null
        val body = countingExecutor.execute(cached.key.organism, cached.index, cached.parsed) {
            cached.info().also {
                info = it
                infoAt = plain.size()
                // a streamed JSON envelope (large details) is not cached: its info cannot be spliced
                tee?.abandon()
            }
        }
        val tExecuted = System.nanoTime()
        val headers = responseHeaders(cached.parsed, cached.endpoint, body, cached.dataVersion, cached.contentEncoding)
        headers.set(HttpHeaders.CACHE_CONTROL, cacheControl(cached.parsed))
        headers.add(HttpHeaders.VARY, VARY)
        val storedHeaders = headers.headerSet().flatMap { (name, values) -> values.map { name to it } }
        val unchanged = { cached.index.contentToken == cached.key.contentToken }

        if (!body.buffered) {
            tee = cached.cache.tee(cached.key, cached.codec)
            if (unchanged()) headers.set(HttpHeaders.ETAG, cached.etag)
            val startResponse = {
                response.status = HttpStatus.OK.value()
                headers.forEach { name, values -> values.forEach { response.addHeader(name, it) } }
                response.addHeader("Server-Timing", "$serverTimingParse, execute;dur=${ms(tExecuted - tParsed)}")
            }
            try {
                stream(
                    body,
                    request,
                    response,
                    cached.parsed.compression,
                    cached.contentEncoding,
                    cached.endpoint.isSequenceEndpoint,
                    tee,
                    startResponse,
                )
            } catch (e: Exception) {
                tee?.abandon()
                throw e
            }
            val t = tee ?: return null
            if (!unchanged()) {
                t.abandon()
                return null
            }
            val cost = MissCost((System.nanoTime() - tParsed) / 1e6, work.rows.get(), work.bytes.get())
            val outcome = t.complete(CachedResponse(storedHeaders, cached.codec, null, t.length), cost)
            log.debug { "Query engine cache: ${cached.key.organism} streamed miss -> $outcome" }
            return null
        }

        body.write(plain)
        val bytes = plain.toByteArray()
        val renderedInfo = info?.let(::renderInfo)
        val splice = renderedInfo != null && infoAt >= 0 && infoAt + renderedInfo.size <= bytes.size &&
            bytes.copyOfRange(infoAt, infoAt + renderedInfo.size).contentEquals(renderedInfo)
        if (renderedInfo != null && !splice) {
            // not the expected shape: send it as rendered, uncached
            log.warn { "Query engine cache: could not locate info in a ${cached.endpoint} response, not cached" }
            val encoded = cached.codec.encodeWhole(bytes)
            val timing = "$serverTimingParse, execute;dur=${ms(tExecuted - tParsed)}"
            if (unchanged()) headers.set(HttpHeaders.ETAG, cached.etag)
            writeBuffered(response, headers, timing, encoded, null)
            return null
        }
        val stored: ByteArray
        val infoSplice: InfoSplice?
        if (renderedInfo != null) {
            stored = cached.codec.encodePrefix(bytes, 0, infoAt)
            infoSplice = InfoSplice(
                suffix = bytes.copyOfRange(infoAt + renderedInfo.size, bytes.size),
                prefixCrc = WireCodec.crc32(bytes, 0, infoAt),
                prefixLength = infoAt.toLong(),
            )
        } else {
            stored = cached.codec.encodeWhole(bytes)
            infoSplice = null
        }
        val cachedResponse = CachedResponse(storedHeaders, cached.codec, infoSplice, stored.size.toLong())
        val tRendered = System.nanoTime()
        val tail = infoSplice?.let { cached.codec.tail(renderedInfo!! + it.suffix, it.prefixCrc, it.prefixLength) }
        val isUnchanged = unchanged()
        if (isUnchanged) headers.set(HttpHeaders.ETAG, cached.etag)
        val timing = "$serverTimingParse, execute;dur=${ms(
            tExecuted - tParsed,
        )}, render;dur=${ms(tRendered - tExecuted)}"
        writeBuffered(response, headers, timing, stored, tail)
        if (!isUnchanged) return null
        val cost = MissCost((tRendered - tParsed) / 1e6, work.rows.get(), work.bytes.get())
        val outcome = cached.cache.offer(cached.key, cachedResponse, stored, cost)
        log.debug { "Query engine cache: ${cached.key.organism} ${cached.endpoint} miss -> $outcome" }
        return if (flight != null) ResponseCache.Shared(cachedResponse, stored) else null
    }

    private fun writeBuffered(
        response: HttpServletResponse,
        headers: HttpHeaders,
        serverTiming: String,
        body: ByteArray,
        tail: ByteArray?,
    ) {
        response.status = HttpStatus.OK.value()
        headers.forEach { name, values -> values.forEach { response.addHeader(name, it) } }
        response.addHeader("Server-Timing", serverTiming)
        response.setContentLengthLong(body.size.toLong() + (tail?.size ?: 0))
        response.outputStream.write(body)
        tail?.let { response.outputStream.write(it) }
        response.outputStream.flush()
    }

    /** a response from the cache (or from an identical concurrent request): stored body, then a fresh info */
    private fun serveCached(
        response: HttpServletResponse,
        cachedResponse: CachedResponse,
        body: java.io.InputStream,
        serverTiming: String,
        cached: Cached,
    ) {
        body.use { input ->
            val tail = cachedResponse.splice?.let {
                cachedResponse.codec.tail(renderInfo(cached.info()) + it.suffix, it.prefixCrc, it.prefixLength)
            }
            response.status = HttpStatus.OK.value()
            cachedResponse.headers.forEach { (name, value) -> response.addHeader(name, value) }
            response.setHeader(LAPIS_DATA_VERSION_HEADER, cached.dataVersion)
            response.setHeader(HttpHeaders.ETAG, cached.etag)
            response.addHeader("Server-Timing", serverTiming)
            response.setContentLengthLong(cachedResponse.bodyLength + (tail?.size ?: 0))
            val out = response.outputStream
            try {
                input.transferTo(out)
                tail?.let { out.write(it) }
                out.flush()
            } catch (e: IOException) {
                // a disk file that cannot be read to the end: never finish the response cleanly
                if (!response.isCommitted) throw e
                throw CloseNowException("cached response aborted: $e", e)
            }
        }
    }

    private fun renderInfo(info: LapisInfo): ByteArray {
        val out = ByteArrayOutputStream(256)
        lapisJsonFactory.createGenerator(out, JsonEncoding.UTF8).use { info.write(it) }
        return out.toByteArray()
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
        sequences: Boolean,
        tee: OutputStream?,
        startResponse: () -> Unit,
    ) {
        val client = ClientOutputStream(response.outputStream)
        val wire: OutputStream = if (tee == null) client else TeeOutputStream(client, tee)
        val deferred = DeferredOutputStream {
            startResponse()
            compress(wire, compression, contentEncoding, sequences)
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
        val definition = system?.let { schema.lineageDefinition(it) }
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

    private fun index(organism: String): OrganismIndex = when (val lookup = indexProvider.forRequest(organism)) {
        is IndexLookup.Ready -> lookup.index
        is IndexLookup.Unavailable -> throw LapisUnavailableException(lookup.reason)
    }

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

        /**
         * Query responses may be stored but must be revalidated (with If-None-Match) before every reuse, so the
         * browser's HTTP cache revalidates repeat GETs itself: a conditional header added by the browser, unlike one
         * set from JavaScript, does not make a cross-origin GET need a CORS preflight. Not `private`: the data is
         * public and the response depends only on the URL and the headers in [VARY], and the website's own caches
         * (browser POST cache, server-side render cache) do not store `private` or `no-store` responses.
         * POST responses keep `no-cache` for those caches; no HTTP cache stores POST responses.
         */
        const val CACHE_CONTROL = "no-cache"

        /** file downloads (`downloadAsFile`) are not kept in the browser's cache */
        const val CACHE_CONTROL_DOWNLOAD = "no-store"

        fun cacheControl(request: QueryRequest) = if (request.downloadAsFile) CACHE_CONTROL_DOWNLOAD else CACHE_CONTROL
        const val VARY = "Accept, Accept-Encoding"

        /**
         * Weak entity tag of the response to [request]: the index state ([contentToken]) plus a hash of everything
         * that selects the representation. Weak, because the JSON envelope's requestId/requestInfo differ between
         * otherwise identical responses. null when the response is not reproducible (unseeded random order).
         *
         * A matching If-None-Match is answered with 304 for POST as well. RFC 9110 §13.1.2 asks for 412 on methods
         * other than GET/HEAD, which presumes an unsafe method; these POSTs are safe queries, and RFC 10008's QUERY
         * (the standard form of a safe query with a body) answers conditionals like GET. Only the website's own
         * JavaScript sends If-None-Match on a POST; no HTTP cache stores POST responses.
         */
        fun entityTag(
            organism: String,
            sequenceName: String?,
            request: QueryRequest,
            contentEncoding: String?,
            dataVersion: String,
            contentToken: String,
        ): String? = requestHash(organism, sequenceName, request, contentEncoding)?.let {
            entityTag(dataVersion, contentToken, it)
        }

        fun entityTag(dataVersion: String, contentToken: String, requestHash: String) =
            "W/\"$dataVersion-$contentToken-$requestHash\""

        /**
         * hash of everything that selects the representation (also the response cache's key); null when the
         * response is not reproducible (unseeded random order)
         */
        fun requestHash(
            organism: String,
            sequenceName: String?,
            request: QueryRequest,
            contentEncoding: String?,
        ): String? {
            if (request.random != null && request.random.seed == null) return null
            // QueryRequest and its Filter tree are data classes: toString() lists every field, lineage filters
            // already expanded to their descendant sets, so a changed lineage definition changes the tag too
            val digest = java.security.MessageDigest.getInstance("SHA-256")
                .digest("$organism\n$sequenceName\n$contentEncoding\n$request".toByteArray(Charsets.UTF_8))
            return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(digest.copyOf(16))
        }

        /** weak comparison (RFC 9110 §8.8.3.2) against each listed tag; `*` is not honoured (no unconditional 304s) */
        fun ifNoneMatchMatches(header: String?, etag: String): Boolean {
            if (header.isNullOrBlank()) return false
            val opaque = etag.removePrefix("W/")
            return header.split(',').any { it.trim().removePrefix("W/") == opaque }
        }

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

        /** [sequences]: the body holds sequences, which gzip at [WireCodec.GZIP_SEQUENCE_LEVEL] */
        fun compress(
            out: OutputStream,
            compression: Compression?,
            contentEncoding: String?,
            sequences: Boolean = false,
        ): OutputStream = when {
            compression == Compression.GZIP || contentEncoding == "gzip" -> WireCodec.gzipOutputStream(
                out,
                OUTPUT_BUFFER_SIZE,
                if (sequences) WireCodec.GZIP_SEQUENCE_LEVEL else WireCodec.GZIP_LEVEL,
            )

            compression == Compression.ZSTD -> WireCodec.zstdDownloadOutputStream(out)

            contentEncoding == "zstd" -> WireCodec.zstdOutputStream(out)

            contentEncoding == "br" -> WireCodec.brotliOutputStream(out)

            else -> out
        }
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

/** writes to [out] and copies to [copy] (a [ResponseCache.Tee], which never throws) */
private class TeeOutputStream(private val out: OutputStream, private val copy: OutputStream) : OutputStream() {
    override fun write(b: Int) {
        out.write(b)
        copy.write(b)
    }

    override fun write(b: ByteArray, off: Int, len: Int) {
        out.write(b, off, len)
        copy.write(b, off, len)
    }

    override fun flush() = out.flush()

    override fun close() = out.close()
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
