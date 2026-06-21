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
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

private val log = KotlinLogging.logger { }

private val FORWARDED_RESPONSE_HEADERS = setOf(
    "content-type",
    "content-encoding",
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

    // The backend exposes /query/metadata but LAPIS calls it /sample/details.
    @PostMapping("/metadata")
    fun proxyMetadata(request: HttpServletRequest, response: HttpServletResponse) {
        log.debug { "Proxying POST /query/metadata -> sample/details" }
        try {
            val rawBody = request.inputStream.bufferedReader().readText()
            val body = lapisProxyService.parseBody(rawBody)
            proxyPost("sample/details", body, response)
        } catch (e: Exception) {
            log.error(e) { "LAPIS proxy error for POST /query/metadata" }
            if (!response.isCommitted) {
                response.status = HttpServletResponse.SC_BAD_GATEWAY
                response.contentType = "application/json"
                val errorBody = """{"error":"LAPIS proxy error","message":${objectMapper.writeValueAsString(
                    e.message,
                )}}"""
                response.outputStream.write(errorBody.toByteArray(Charsets.UTF_8))
            }
        }
    }

    @PostMapping("/{endpoint}")
    fun proxyPost(@PathVariable endpoint: String, request: HttpServletRequest, response: HttpServletResponse) {
        log.debug { "Proxying POST /query/$endpoint" }
        try {
            val rawBody = request.inputStream.bufferedReader().readText()
            val body = lapisProxyService.parseBody(rawBody)
            proxyPost("sample/$endpoint", body, response)
        } catch (e: Exception) {
            log.error(e) { "LAPIS proxy error for POST /query/$endpoint" }
            if (!response.isCommitted) {
                response.status = HttpServletResponse.SC_BAD_GATEWAY
                response.contentType = "application/json"
                val errorBody = """{"error":"LAPIS proxy error","message":${objectMapper.writeValueAsString(
                    e.message,
                )}}"""
                response.outputStream.write(errorBody.toByteArray(Charsets.UTF_8))
            }
        }
    }

    // ── GET sequence-download endpoints ─────────────────────────────────────
    // `organism` is required (query param) so unified segment/gene names can be
    // constructed. `segment` and `gene` are also query params (not path variables).

    @GetMapping("/unalignedNucleotideSequences")
    fun getUnalignedNucleotideSequences(
        @RequestParam(required = false) @Valid organism: Organism?,
        @RequestParam(required = false) segment: String?,
        @RequestParam(required = false) reference: String?,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        val lapisSegment = if (organism != null) {
            buildLapisSegmentName(organism, segment, reference)
        } else {
            segment ?: throw IllegalArgumentException("segment is required when organism is not specified")
        }
        proxyGet(
            "sample/unalignedNucleotideSequences/$lapisSegment",
            organism?.name,
            request,
            response,
            setOf("segment", "reference"),
        )
    }

    @GetMapping("/alignedNucleotideSequences")
    fun getAlignedNucleotideSequences(
        @RequestParam @Valid organism: Organism,
        @RequestParam(required = false) segment: String?,
        @RequestParam(required = false) reference: String?,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        val lapisSegment = buildLapisSegmentName(organism, segment, reference)
        proxyGet(
            "sample/alignedNucleotideSequences/$lapisSegment",
            organism.name,
            request,
            response,
            setOf("segment", "reference"),
        )
    }

    @GetMapping("/alignedAminoAcidSequences")
    fun getAlignedAminoAcidSequences(
        @RequestParam @Valid organism: Organism,
        @RequestParam @Valid gene: String,
        @RequestParam(required = false) reference: String?,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        val lapisGene = buildLapisGeneName(organism, gene, reference)
        proxyGet("sample/alignedAminoAcidSequences/$lapisGene", organism.name, request, response, setOf("gene", "reference"))
    }

    // ── POST sequence endpoints ──────────────────────────────────────────────
    // `organism` is extracted from the POST body; `segment` and `gene` come from
    // query params. The full body (including organism) is forwarded to LAPIS for
    // filtering.

    @PostMapping("/unalignedNucleotideSequences")
    fun postUnalignedNucleotideSequences(
        @RequestParam(required = false) organism: String?,
        @RequestParam(required = false) segment: String?,
        @RequestParam(required = false) reference: String?,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        postSequenceEndpoint("unalignedNucleotideSequences", organism, segment, reference, request, response)
    }

    @PostMapping("/alignedNucleotideSequences")
    fun postAlignedNucleotideSequences(
        @RequestParam(required = false) organism: String?,
        @RequestParam(required = false) segment: String?,
        @RequestParam(required = false) reference: String?,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        postSequenceEndpoint("alignedNucleotideSequences", organism, segment, reference, request, response)
    }

    @PostMapping("/alignedAminoAcidSequences")
    fun postAlignedAminoAcidSequences(
        @RequestParam(required = false) organism: String?,
        @RequestParam @Valid gene: String,
        @RequestParam(required = false) reference: String?,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        log.debug { "Proxying POST /query/alignedAminoAcidSequences?gene=$gene&reference=$reference" }
        try {
            val rawBody = request.inputStream.bufferedReader().readText()
            val body = lapisProxyService.parseBody(rawBody)
            val resolvedOrganism = organism
                ?: body["organism"]?.toString()
                ?: throw IllegalArgumentException("organism required as query param or in body")
            val org = Organism(resolvedOrganism)
            proxyPost("sample/alignedAminoAcidSequences/${buildLapisGeneName(org, gene, reference)}", body, response)
        } catch (e: Exception) {
            log.error(e) { "LAPIS proxy error for POST /query/alignedAminoAcidSequences" }
            if (!response.isCommitted) {
                response.status = HttpServletResponse.SC_BAD_GATEWAY
                response.contentType = "application/json"
                val errorBody = """{"error":"LAPIS proxy error","message":${objectMapper.writeValueAsString(
                    e.message,
                )}}"""
                response.outputStream.write(errorBody.toByteArray(Charsets.UTF_8))
            }
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private fun postSequenceEndpoint(
        lapisEndpoint: String,
        organismParam: String?,
        segment: String?,
        reference: String?,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        log.debug { "Proxying POST /query/$lapisEndpoint?segment=$segment&reference=$reference" }
        try {
            val rawBody = request.inputStream.bufferedReader().readText()
            val body = lapisProxyService.parseBody(rawBody)
            val resolvedOrganism = organismParam
                ?: body["organism"]?.toString()
                ?: throw IllegalArgumentException("organism required as query param or in body")
            val org = Organism(resolvedOrganism)
            val lapisSegment = buildLapisSegmentName(org, segment, reference)
            proxyPost("sample/$lapisEndpoint/$lapisSegment", body, response)
        } catch (e: Exception) {
            log.error(e) { "LAPIS proxy error for POST /query/$lapisEndpoint" }
            if (!response.isCommitted) {
                response.status = HttpServletResponse.SC_BAD_GATEWAY
                response.contentType = "application/json"
                val errorBody = """{"error":"LAPIS proxy error","message":${objectMapper.writeValueAsString(
                    e.message,
                )}}"""
                response.outputStream.write(errorBody.toByteArray(Charsets.UTF_8))
            }
        }
    }

    private fun buildLapisSegmentName(org: Organism, segment: String?, reference: String?): String = when {
        segment != null && reference != null -> "${org.name}_$segment-$reference"
        segment != null -> "${org.name}_$segment"
        reference != null -> "${org.name}_$reference"
        else -> resolveDefaultSegment(org)
    }

    private fun buildLapisGeneName(org: Organism, gene: String, reference: String?): String =
        if (reference != null) "${org.name}_$gene-$reference" else "${org.name}_$gene"

    private fun resolveDefaultSegment(organism: Organism): String {
        val refGenome = backendConfig.getInstanceConfig(organism).referenceGenome
        return if (refGenome.nucleotideSequences.size == 1) {
            organism.name
        } else {
            throw IllegalArgumentException(
                "Organism ${organism.name} has multiple segments; use the segment query param.",
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
            responseStatus = { response.status = it },
            writeResponse = { it.copyTo(response.outputStream) },
        )
    }

    private fun proxyGet(
        lapisPath: String,
        organism: String?,
        request: HttpServletRequest,
        response: HttpServletResponse,
        extraExcludeParams: Set<String> = emptySet(),
    ) {
        val excludeKeys = setOf("organism") + extraExcludeParams
        val queryParams = mutableMapOf<String, String>()
        if (organism != null) queryParams["organism"] = organism
        request.parameterMap.forEach { (key, values) ->
            if (key !in excludeKeys && values.isNotEmpty()) queryParams[key] = values[0]
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
