package org.loculus.backend.query.api

import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.databind.ObjectMapper
import org.loculus.backend.query.cache.WireCodec
import org.loculus.backend.query.request.Endpoint
import org.loculus.backend.query.request.QueryBadRequestException
import java.io.InputStream

/**
 * Normalises LAPIS request parameters (GET query / form body / JSON body) into the shape the request parser
 * expects: name -> values.
 */
object LapisParams {
    private val objectMapper = ObjectMapper()

    /** GET query parameters or form-urlencoded body: repeated keys = several values */
    fun fromParameterMap(parameters: Map<String, Array<String>>): Map<String, List<Any?>> =
        parameters.entries.associateTo(LinkedHashMap()) { (key, values) -> key to values.toList() }

    /**
     * JSON body: must be an object. Arrays are flattened into the value list (their elements kept as is, e.g.
     * orderBy objects as Maps), every other value becomes a one-element list (null included).
     */
    fun fromJson(body: InputStream): Map<String, List<Any?>> {
        val bytes = body.readBytes()
        if (bytes.all { it.toInt().toChar().isWhitespace() }) return emptyMap()
        val parsed: Any? = try {
            objectMapper.readValue(bytes, Any::class.java)
        } catch (e: JsonProcessingException) {
            throw QueryBadRequestException("Failed to read request body: ${e.originalMessage}")
        }
        if (parsed !is Map<*, *>) throw QueryBadRequestException("The request body must be a JSON object")
        return parsed.entries.associateTo(LinkedHashMap()) { (key, value) ->
            key.toString() to when (value) {
                is List<*> -> value.toList()
                else -> listOf(value)
            }
        }
    }

    // ---------------- content negotiation ----------------

    private data class MediaRange(val type: String, val parameters: Map<String, String>, val quality: Double)

    private fun parseAccept(accept: String): List<MediaRange> = accept.split(',').mapNotNull { part ->
        val pieces = part.split(';').map { it.trim() }
        val type = pieces.first().lowercase()
        if (type.isEmpty()) return@mapNotNull null
        val parameters = pieces.drop(1).mapNotNull {
            val eq = it.indexOf('=')
            if (eq < 0) null else it.substring(0, eq).trim().lowercase() to it.substring(eq + 1).trim().trim('"')
        }.toMap()
        val quality = parameters["q"]?.toDoubleOrNull() ?: 1.0
        MediaRange(type, parameters, quality)
    }.filter { it.quality > 0 }.sortedByDescending { it.quality }

    /**
     * The dataFormat implied by the Accept header (when the request has no dataFormat parameter), like LAPIS'
     * content negotiation. null = the endpoint's default format.
     */
    fun dataFormatFromAccept(accept: String?, endpoint: Endpoint): String? {
        if (accept.isNullOrBlank()) return null
        val ranges = parseAccept(accept)
        if (ranges.isEmpty()) return null
        for (range in ranges) {
            if (range.type == "*/*" || range.type.endsWith("/*")) return null
            if (endpoint.isSequenceEndpoint) {
                when (range.type) {
                    "text/x-fasta" -> return null
                    "application/json" -> return "json"
                    "application/x-ndjson" -> return "ndjson"
                }
            } else {
                when (range.type) {
                    "application/json" -> return null
                    "text/csv" -> return if (range.parameters["headers"] == "false") "csv-without-headers" else "csv"
                    "text/tab-separated-values" -> return "tsv"
                }
            }
        }
        val acceptable = if (endpoint.isSequenceEndpoint) {
            "text/x-fasta, application/json, application/x-ndjson"
        } else {
            "text/tab-separated-values, application/json, text/csv"
        }
        throw LapisNotAcceptableException("Acceptable representations: [$acceptable].")
    }

    /** the response Content-Encoding chosen from Accept-Encoding: zstd, else br, else gzip */
    fun contentEncodingFromAcceptEncoding(acceptEncoding: String?): String? {
        if (acceptEncoding.isNullOrBlank()) return null
        val accepted = acceptEncoding.split(',').mapNotNull { part ->
            val pieces = part.split(';').map { it.trim() }
            val q = pieces.drop(1).firstOrNull { it.startsWith("q=") }?.substring(2)?.toDoubleOrNull() ?: 1.0
            if (q > 0) pieces.first().lowercase() else null
        }.toSet()
        return when {
            "zstd" in accepted -> "zstd"
            "br" in accepted && WireCodec.brotliAvailable -> "br"
            "gzip" in accepted -> "gzip"
            else -> null
        }
    }
}
