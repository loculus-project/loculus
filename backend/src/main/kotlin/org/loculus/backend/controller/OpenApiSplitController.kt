package org.loculus.backend.controller

import io.swagger.v3.core.util.Json
import io.swagger.v3.oas.annotations.Hidden
import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.Paths
import io.swagger.v3.oas.models.tags.Tag
import jakarta.servlet.http.HttpServletRequest
import org.springdoc.webmvc.api.OpenApiWebMvcResource
import org.springframework.context.i18n.LocaleContextHolder
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

private const val SPRINGDOC_API_DOCS_PATH = "/api-docs.json"

@Hidden
@RestController
class OpenApiSplitController(private val openApiResource: OpenApiWebMvcResource) {

    @GetMapping("/api-docs/general.json", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun generalJson(request: HttpServletRequest): ResponseEntity<ByteArray> {
        val openApi = generatedOpenApi(request)
        openApi.paths = filteredPaths(openApi) { path -> !path.startsWith("/query/") }
        openApi.keepOnlyUsedTags()
        return jsonResponse(Json.mapper().writeValueAsBytes(openApi))
    }

    @GetMapping("/api-docs.yaml", produces = ["application/vnd.oai.openapi"])
    fun completeYaml(request: HttpServletRequest): ResponseEntity<ByteArray> = ResponseEntity.ok()
        .contentType(MediaType.parseMediaType("application/vnd.oai.openapi"))
        .body(openApiResource.openapiYaml(request, SPRINGDOC_API_DOCS_PATH, LocaleContextHolder.getLocale()))

    @GetMapping("/api-docs/query/{organism}.json", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun queryJson(request: HttpServletRequest, @PathVariable organism: String): ResponseEntity<ByteArray> {
        val openApi = generatedOpenApi(request)
        openApi.paths = filteredPaths(openApi) { path -> path.startsWith("/query/$organism/") }
        if (openApi.paths.isEmpty()) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "No query OpenAPI specification exists for $organism")
        }
        openApi.keepOnlyUsedTags()
        return jsonResponse(Json.mapper().writeValueAsBytes(openApi))
    }

    private fun generatedOpenApi(request: HttpServletRequest): OpenAPI {
        val json = openApiResource.openapiJson(request, SPRINGDOC_API_DOCS_PATH, LocaleContextHolder.getLocale())
        return Json.mapper().readValue(json, OpenAPI::class.java)
    }

    private fun filteredPaths(openApi: OpenAPI, includePath: (String) -> Boolean): Paths {
        val paths = Paths()
        openApi.paths.orEmpty()
            .filterKeys(includePath)
            .forEach { (path, pathItem) -> paths.addPathItem(path, pathItem) }
        return paths
    }

    private fun OpenAPI.keepOnlyUsedTags() {
        val usedTags = paths.orEmpty()
            .values
            .flatMap { pathItem -> pathItem.readOperations().flatMap { operation -> operation.tags.orEmpty() } }
            .toSet()

        tags = tags
            ?.filter { tag -> tag.name in usedTags }
            ?.map { tag -> Tag().name(tag.name).description(tag.description).externalDocs(tag.externalDocs) }
    }

    private fun jsonResponse(body: ByteArray): ResponseEntity<ByteArray> = ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_JSON)
        .body(body)
}
