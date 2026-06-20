package org.loculus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.Valid
import mu.KotlinLogging
import org.loculus.backend.api.Organism
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.service.lapis.LapisProxyService
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

private val log = KotlinLogging.logger { }

private val FORWARDED_RESPONSE_HEADERS = setOf(
    "content-type",
    "content-encoding",
    "transfer-encoding",
)

/**
 * Proxies LAPIS/SILO queries under `/query/{endpoint}`.
 *
 * The `organism` parameter is optional for POST endpoints (caller includes it in the
 * request body as a SILO filter field). For GET sequence-download endpoints, `organism`
 * is required so the backend can remap unified segment names back to per-organism names.
 */
@RestController
@RequestMapping("/query")
@PreAuthorize("permitAll()")
class LapisProxyController(
    private val lapisProxyService: LapisProxyService,
    private val backendConfig: BackendConfig,
    private val objectMapper: ObjectMapper,
) {
    // ── POST pass-through ────────────────────────────────────────────────────
    // Caller places `organism` in the request body (as a SILO filter) when
    // scoping to a single organism. All-organism queries omit it.

    @PostMapping("/{endpoint}")
    fun proxyPost(
        @PathVariable endpoint: String,
        @RequestBody(required = false) rawBody: String?,
        response: HttpServletResponse,
    ) {
        log.debug { "Proxying POST /query/$endpoint" }
        try {
            val body = lapisProxyService.parseBody(rawBody ?: "")
            proxyPost("sample/$endpoint", body, response)
        } catch (e: Exception) {
            log.error(e) { "LAPIS proxy error for POST /query/$endpoint" }
            response.status = HttpServletResponse.SC_BAD_GATEWAY
            response.contentType = "application/json"
            response.writer.write("""{"error":"LAPIS proxy error","message":${objectMapper.writeValueAsString(e.message)}}""")
        }
    }

    // ── GET sequence-download endpoints ─────────────────────────────────────
    // `organism` is required so that unified segment names (e.g. `rsv_a_L`) can
    // be derived from the organism-local name (e.g. `L`).

    @GetMapping("/unalignedNucleotideSequences")
    fun proxyUnalignedNucleotideSequences(
        @RequestParam @Valid organism: String,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        val org = Organism(organism)
        val segmentName = resolveDefaultSegment(org)
        proxyGet("sample/unalignedNucleotideSequences/$segmentName", organism, request, response)
    }

    @GetMapping("/unalignedNucleotideSequences/{segment}")
    fun proxyUnalignedNucleotideSequenceSegment(
        @PathVariable segment: String,
        @RequestParam @Valid organism: String,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        val org = Organism(organism)
        proxyGet("sample/unalignedNucleotideSequences/${org.name}_$segment", organism, request, response)
    }

    @GetMapping("/alignedNucleotideSequences")
    fun proxyAlignedNucleotideSequences(
        @RequestParam @Valid organism: String,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        val org = Organism(organism)
        val segmentName = resolveDefaultSegment(org)
        proxyGet("sample/alignedNucleotideSequences/$segmentName", organism, request, response)
    }

    @GetMapping("/alignedNucleotideSequences/{segment}")
    fun proxyAlignedNucleotideSequenceSegment(
        @PathVariable segment: String,
        @RequestParam @Valid organism: String,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        val org = Organism(organism)
        proxyGet("sample/alignedNucleotideSequences/${org.name}_$segment", organism, request, response)
    }

    @GetMapping("/aminoAcidSequences/{gene}")
    fun proxyAminoAcidSequences(
        @PathVariable gene: String,
        @RequestParam @Valid organism: String,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        val org = Organism(organism)
        proxyGet("sample/aminoAcidSequences/${org.name}_$gene", organism, request, response)
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private fun resolveDefaultSegment(organism: Organism): String {
        val refGenome = backendConfig.getInstanceConfig(organism).referenceGenome
        return if (refGenome.nucleotideSequences.size == 1) {
            organism.name
        } else {
            throw IllegalArgumentException(
                "Organism ${organism.name} has multiple segments; use the segment-specific endpoint.",
            )
        }
    }

    private fun proxyPost(lapisPath: String, body: Map<String, Any?>, response: HttpServletResponse) {
        lapisProxyService.proxyPost(
            lapisPath = lapisPath,
            body = body,
            responseHeaders = { name, value ->
                if (name.lowercase() in FORWARDED_RESPONSE_HEADERS) response.addHeader(name, value)
            },
            writeResponse = { it.copyTo(response.outputStream) },
        )
    }

    private fun proxyGet(
        lapisPath: String,
        organism: String,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        val queryParams = mutableMapOf("organism" to organism)
        request.parameterMap.forEach { (key, values) ->
            if (key != "organism" && values.isNotEmpty()) queryParams[key] = values[0]
        }
        lapisProxyService.proxyGet(
            lapisPath = lapisPath,
            queryParams = queryParams,
            responseHeaders = { name, value ->
                if (name.lowercase() in FORWARDED_RESPONSE_HEADERS) response.addHeader(name, value)
            },
            writeResponse = { it.copyTo(response.outputStream) },
        )
    }
}
