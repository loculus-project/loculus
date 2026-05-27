package org.loculus.backend.controller

import jakarta.servlet.http.HttpServletRequest
import org.loculus.backend.config.BackendConfig
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestMethod
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody

@RestController
class LapisProxyController(
    private val backendConfig: BackendConfig,
    private val lapisProxyService: LapisProxyService,
) {

    @RequestMapping(
        value = ["/{organism}/lapis/**"],
        method = [RequestMethod.GET, RequestMethod.POST],
    )
    fun proxy(@PathVariable organism: String, request: HttpServletRequest): ResponseEntity<StreamingResponseBody> {
        val instanceConfig = backendConfig.organisms[organism]
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown organism: $organism")

        val lapisPath = request.requestURI.removePrefix("/$organism/lapis")
        val query = request.queryString?.let { "?$it" } ?: ""

        return if (request.method == "POST") {
            lapisProxyService.proxyPost(
                instanceConfig.lapisUrl,
                "$lapisPath$query",
                request.inputStream.readBytes(),
                request.getHeader("Accept"),
                request.contentType ?: "application/json",
            )
        } else {
            lapisProxyService.proxyGet(
                instanceConfig.lapisUrl,
                lapisPath,
                query,
                request.getHeader("Accept"),
            )
        }
    }
}
