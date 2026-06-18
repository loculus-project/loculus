package org.loculus.backend.controller

import mu.KotlinLogging
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import java.io.IOException
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

private val log = KotlinLogging.logger {}

@Component
class LapisProxyService {

    private val httpClient = HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_1_1)
        .connectTimeout(Duration.ofSeconds(10))
        .build()

    fun proxyPost(
        lapisBaseUrl: String,
        lapisPath: String,
        bodyBytes: ByteArray,
        acceptHeader: String?,
        contentType: String = "application/json",
    ): ResponseEntity<StreamingResponseBody> {
        val url = lapisBaseUrl.trimEnd('/') + lapisPath
        log.debug { "Proxying POST $url" }
        val request = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .header("Content-Type", contentType)
            .apply { acceptHeader?.let { header("Accept", it) } }
            .POST(HttpRequest.BodyPublishers.ofByteArray(bodyBytes))
            .build()
        return dispatch(request)
    }

    fun proxyGet(
        lapisBaseUrl: String,
        lapisPath: String,
        query: String,
        acceptHeader: String?,
    ): ResponseEntity<StreamingResponseBody> {
        val url = lapisBaseUrl.trimEnd('/') + lapisPath + query
        log.debug { "Proxying GET $url" }
        val request = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .apply { acceptHeader?.let { header("Accept", it) } }
            .GET()
            .build()
        return dispatch(request)
    }

    private fun dispatch(request: HttpRequest): ResponseEntity<StreamingResponseBody> {
        val upstreamResponse = try {
            httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream())
        } catch (e: IOException) {
            throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "LAPIS service unavailable: ${e.message}")
        }

        val responseHeaders = HttpHeaders()
        upstreamResponse.headers().map().forEach { (name, values) ->
            if (name.lowercase() !in HOP_BY_HOP_HEADERS) {
                responseHeaders[name] = values
            }
        }
        responseHeaders.remove(HttpHeaders.CONTENT_LENGTH)

        val body = StreamingResponseBody { outputStream ->
            upstreamResponse.body().use { inputStream ->
                inputStream.copyTo(outputStream, bufferSize = 8192)
            }
        }

        return ResponseEntity(body, responseHeaders, HttpStatus.valueOf(upstreamResponse.statusCode()))
    }

    companion object {
        val HOP_BY_HOP_HEADERS = setOf(
            "connection",
            "keep-alive",
            "transfer-encoding",
            "te",
            "trailer",
            "upgrade",
            "proxy-authorization",
            "proxy-authenticate",
        )
    }
}
