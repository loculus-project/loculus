package org.loculus.backend.service.lapis

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import mu.KotlinLogging
import org.loculus.backend.config.BackendConfig
import org.springframework.stereotype.Service
import java.io.InputStream
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse

private val log = KotlinLogging.logger { }

@Service
class LapisProxyService(private val backendConfig: BackendConfig, private val objectMapper: ObjectMapper) {
    private val httpClient: HttpClient = HttpClient.newBuilder().build()

    fun proxyPost(
        lapisPath: String,
        body: Map<String, Any?>,
        responseHeaders: (String, String) -> Unit,
        writeResponse: (InputStream) -> Unit,
    ) {
        val url = "${backendConfig.lapisUrl}/$lapisPath"
        log.debug { "Proxying POST to $url" }

        val requestBody = objectMapper.writeValueAsString(body)
        val request = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(requestBody))
            .build()

        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream())
        response.headers().map().forEach { (name, values) ->
            values.forEach { value -> responseHeaders(name, value) }
        }
        response.body().use { writeResponse(it) }
    }

    fun proxyGet(
        lapisPath: String,
        queryParams: Map<String, String>,
        responseHeaders: (String, String) -> Unit,
        writeResponse: (InputStream) -> Unit,
    ) {
        val queryString = queryParams.entries.joinToString("&") { (k, v) ->
            "${java.net.URLEncoder.encode(k, "UTF-8")}=${java.net.URLEncoder.encode(v, "UTF-8")}"
        }
        val url = "${backendConfig.lapisUrl}/$lapisPath${if (queryString.isNotEmpty()) "?$queryString" else ""}"
        log.debug { "Proxying GET to $url" }

        val request = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .GET()
            .build()

        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream())
        response.headers().map().forEach { (name, values) ->
            values.forEach { value -> responseHeaders(name, value) }
        }
        response.body().use { writeResponse(it) }
    }

    fun injectOrganism(body: Map<String, Any?>, organism: String): Map<String, Any?> = body + ("organism" to organism)

    fun parseBody(raw: String): Map<String, Any?> = if (raw.isBlank()) emptyMap() else objectMapper.readValue(raw)
}
