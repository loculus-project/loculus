package org.loculus.backend.controller

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * Prepares request bodies / query strings before they are forwarded to the
 * upstream LAPIS instance. It injects the LAPIS `versionStatus` filter that
 * distinguishes the `current` (latest) and `allVersions` query groups.
 *
 * Note: query endpoints are currently open (no authentication), so no
 * group-based visibility filtering is applied here. Should per-group
 * visibility be reintroduced, this is the single place to add it (combine a
 * visibility clause into `advancedQuery` for both the body and query-string
 * paths).
 */
@Component
class LapisAccessFilter(private val objectMapper: ObjectMapper) {
    fun prepareBody(body: JsonNode?, versionStatus: String? = null): ByteArray {
        val node: ObjectNode = when {
            body == null || body.isNull -> objectMapper.createObjectNode()
            body.isObject -> body.deepCopy()
            else -> throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Request body must be a JSON object")
        }
        if (versionStatus != null) {
            node.put("versionStatus", versionStatus)
        }
        return objectMapper.writeValueAsBytes(node)
    }

    fun prepareBody(rawBody: ByteArray, versionStatus: String? = null): ByteArray {
        val body = rawBody.takeIf { it.isNotEmpty() }?.let { objectMapper.readTree(it) }
        return prepareBody(body, versionStatus)
    }

    fun prepareQuery(queryString: String?, versionStatus: String? = null): String {
        val queryParameters = parseQueryString(queryString).toMutableList()
        if (versionStatus != null) {
            queryParameters.add("versionStatus" to versionStatus)
        }
        if (queryParameters.isEmpty()) return ""
        return "?" + queryParameters.joinToString("&") { (key, value) ->
            "${urlEncode(key)}=${urlEncode(value)}"
        }
    }

    private fun parseQueryString(queryString: String?): List<Pair<String, String>> {
        if (queryString.isNullOrBlank()) return emptyList()
        return queryString.split("&").mapNotNull { part ->
            val (key, value) = part.split("=", limit = 2).let {
                it[0] to it.getOrElse(1) { "" }
            }
            if (key.isBlank()) null else urlDecode(key) to urlDecode(value)
        }
    }

    private fun urlEncode(value: String) = URLEncoder.encode(value, StandardCharsets.UTF_8)

    private fun urlDecode(value: String) = URLDecoder.decode(value, StandardCharsets.UTF_8)
}
