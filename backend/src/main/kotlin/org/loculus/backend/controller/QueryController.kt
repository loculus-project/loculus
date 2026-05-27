package org.loculus.backend.controller

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import io.swagger.v3.oas.annotations.Hidden
import org.loculus.backend.config.BackendConfig
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody

@Hidden
@RestController
@RequestMapping("/query/{organism}")
class QueryController(
    private val backendConfig: BackendConfig,
    private val lapisProxyService: LapisProxyService,
    private val objectMapper: ObjectMapper,
) {
    private enum class VersionGroup(val lapisFilter: String?) {
        CURRENT("LATEST_VERSION"),
        ALL_VERSIONS(null),
        ;

        companion object {
            fun fromPath(value: String): VersionGroup = when (value) {
                "current" -> CURRENT
                "allVersions" -> ALL_VERSIONS
                else -> throw ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown versionGroup: $value")
            }
        }
    }

    private fun getInstanceConfig(organism: String) = backendConfig.organisms[organism]
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown organism: $organism")

    private fun prepareBody(body: JsonNode?, vg: VersionGroup): ByteArray {
        val node: ObjectNode = when {
            body == null || body.isNull -> objectMapper.createObjectNode()
            body.isObject -> body.deepCopy()
            else -> throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Request body must be a JSON object")
        }
        if (vg.lapisFilter != null) {
            node.put("versionStatus", vg.lapisFilter)
        }
        return objectMapper.writeValueAsBytes(node)
    }

    private fun post(
        organism: String,
        versionGroup: String,
        lapisPath: String,
        body: JsonNode?,
        accept: String?,
    ): ResponseEntity<StreamingResponseBody> {
        val config = getInstanceConfig(organism)
        val vg = VersionGroup.fromPath(versionGroup)
        return lapisProxyService.proxyPost(config.lapisUrl, lapisPath, prepareBody(body, vg), accept)
    }

    @PostMapping("/{versionGroup}/metadata")
    fun metadata(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/details", body, accept)

    @PostMapping("/{versionGroup}/aggregated")
    fun aggregated(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/aggregated", body, accept)

    @PostMapping("/{versionGroup}/sequences")
    fun sequences(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/unalignedNucleotideSequences", body, accept)

    @PostMapping("/{versionGroup}/sequencesAligned")
    fun sequencesAligned(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/alignedNucleotideSequences", body, accept)

    @PostMapping("/{versionGroup}/sequencesAligned/mutations")
    fun sequencesAlignedMutations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/nucleotideMutations", body, accept)

    @PostMapping("/{versionGroup}/sequencesAligned/aggregatedMutations")
    fun sequencesAlignedAggregatedMutations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/nucleotideMutations", body, accept)

    @PostMapping("/{versionGroup}/sequencesAligned/{referenceName}")
    fun sequencesAlignedForSegment(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable referenceName: String,
        @RequestBody(required = false) body: JsonNode?,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/alignedNucleotideSequences/$referenceName", body, accept)

    @PostMapping("/{versionGroup}/sequencesAligned/{referenceName}/mutations")
    fun sequencesAlignedForSegmentMutations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable referenceName: String,
        @RequestBody(required = false) body: JsonNode?,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/nucleotideMutations", body, accept)

    @PostMapping("/{versionGroup}/sequencesAligned/{referenceName}/aggregatedMutations")
    fun sequencesAlignedForSegmentAggregatedMutations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable referenceName: String,
        @RequestBody(required = false) body: JsonNode?,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/nucleotideMutations", body, accept)

    @PostMapping("/{versionGroup}/translations/{geneName}")
    fun translations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable geneName: String,
        @RequestBody(required = false) body: JsonNode?,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/alignedAminoAcidSequences/$geneName", body, accept)

    @PostMapping("/{versionGroup}/translations/{geneName}/mutations")
    fun translationsMutations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable geneName: String,
        @RequestBody(required = false) body: JsonNode?,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/aminoAcidMutations", body, accept)

    @PostMapping("/{versionGroup}/translations/{geneName}/aggregatedMutations")
    fun translationsAggregatedMutations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable geneName: String,
        @RequestBody(required = false) body: JsonNode?,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/aminoAcidMutations", body, accept)
}
