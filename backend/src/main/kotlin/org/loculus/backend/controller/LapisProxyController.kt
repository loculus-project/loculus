package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.servlet.http.HttpServletRequest
import org.loculus.backend.config.LAPIS_PROXY_CONTROLLER_TAG
import org.loculus.backend.config.service.ConfigService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestMethod
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody

@RestController
@Tag(
    name = LAPIS_PROXY_CONTROLLER_TAG,
    description = "This is temporary and used for calls that have not yet switched to using the new query API.",
)
class LapisProxyController(
    private val configService: ConfigService,
    private val lapisProxyService: LapisProxyService,
    private val lapisAccessFilter: LapisAccessFilter,
) {

    @RequestMapping(
        value = ["/{organism}/lapis/**"],
        method = [RequestMethod.GET, RequestMethod.POST],
    )
    fun proxy(@PathVariable organism: String, request: HttpServletRequest): ResponseEntity<StreamingResponseBody> {
        val lapisUrl = configService.lapisUrlFor(organism)

        val lapisPath = request.requestURI.removePrefix("/$organism/lapis")
        val query = request.queryString?.let { "?$it" } ?: ""

        return if (request.method == "POST") {
            lapisProxyService.proxyPost(
                lapisUrl,
                "$lapisPath$query",
                lapisAccessFilter.prepareBody(request.inputStream.readBytes()),
                request.getHeader("Accept"),
                request.contentType ?: "application/json",
            )
        } else {
            lapisProxyService.proxyGet(
                lapisUrl,
                lapisPath,
                lapisAccessFilter.prepareQuery(request.queryString),
                request.getHeader("Accept"),
            )
        }
    }
}
