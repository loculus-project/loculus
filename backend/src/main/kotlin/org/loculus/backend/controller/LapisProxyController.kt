package org.loculus.backend.controller

import jakarta.servlet.http.HttpServletRequest
import mu.KotlinLogging
import org.loculus.backend.config.BackendConfig
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestMethod
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import java.io.IOException
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse

private val log = KotlinLogging.logger {}

@RestController
class LapisProxyController(private val backendConfig: BackendConfig) {

    private val httpClient = HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_1_1)
        .build()

    @RequestMapping(
        value = ["/{organism}/lapis/**"],
        method = [RequestMethod.GET, RequestMethod.POST],
    )
    fun proxy(@PathVariable organism: String, request: HttpServletRequest): ResponseEntity<StreamingResponseBody> {
        val instanceConfig = backendConfig.organisms[organism]
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown organism: $organism")

        val lapisPath = request.requestURI.removePrefix("/$organism/lapis")
        val query = request.queryString?.let { "?$it" } ?: ""
        val targetUrl = "${instanceConfig.lapisUrl}$lapisPath$query"

        log.debug { "Proxying ${request.method} $targetUrl" }

        val bodyBytes = if (request.method == "POST") request.inputStream.readBytes() else byteArrayOf()
        val contentType = request.contentType ?: "application/json"

        val requestBuilder = HttpRequest.newBuilder()
            .uri(URI.create(targetUrl))
            .apply {
                request.getHeader("Accept")?.let { header("Accept", it) }
                if (request.method == "POST") {
                    header("Content-Type", contentType)
                    POST(HttpRequest.BodyPublishers.ofByteArray(bodyBytes))
                } else {
                    GET()
                }
            }

        val upstreamResponse = try {
            httpClient.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofInputStream())
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
        private val HOP_BY_HOP_HEADERS = setOf(
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
