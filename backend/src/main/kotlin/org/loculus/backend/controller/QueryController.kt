package org.loculus.backend.controller

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import jakarta.servlet.http.HttpServletRequest
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.auth.HiddenParam
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.service.groupmanagement.GroupManagementDatabaseService
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody

@RestController
@RequestMapping("/query/{organism}")
class QueryController(
    private val backendConfig: BackendConfig,
    private val lapisProxyService: LapisProxyService,
    private val objectMapper: ObjectMapper,
    private val groupManagementDatabaseService: GroupManagementDatabaseService,
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

    private fun groupIdsFor(authenticatedUser: AuthenticatedUser): List<Int> {
        if (authenticatedUser.isSuperUser) return emptyList()
        val ids = groupManagementDatabaseService.getGroupIdsOfUser(authenticatedUser)
        return ids.ifEmpty { listOf(-1) }
    }

    private fun prepareBody(body: JsonNode?, vg: VersionGroup, groupIds: List<Int>): ByteArray {
        val node: ObjectNode = when {
            body == null || body.isNull -> objectMapper.createObjectNode()
            body.isObject -> body.deepCopy()
            else -> throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Request body must be a JSON object")
        }
        if (vg.lapisFilter != null) {
            node.put("versionStatus", vg.lapisFilter)
        }
        if (groupIds.isNotEmpty()) {
            val arr = objectMapper.createArrayNode()
            groupIds.forEach { arr.add(it) }
            node.set<ObjectNode>("groupId", arr)
        }
        return objectMapper.writeValueAsBytes(node)
    }

    private fun prepareQuery(queryString: String?, vg: VersionGroup, groupIds: List<Int>): String {
        val extraParams = buildList {
            if (vg.lapisFilter != null) add("versionStatus=${vg.lapisFilter}")
            groupIds.forEach { add("groupId=$it") }
        }
        if (extraParams.isEmpty()) return if (queryString.isNullOrEmpty()) "" else "?$queryString"
        val combined = if (queryString.isNullOrEmpty()) extraParams else listOf(queryString) + extraParams
        return "?${combined.joinToString("&")}"
    }

    private fun post(
        organism: String,
        versionGroup: String,
        lapisPath: String,
        body: JsonNode?,
        authenticatedUser: AuthenticatedUser,
        accept: String?,
    ): ResponseEntity<StreamingResponseBody> {
        val config = getInstanceConfig(organism)
        val vg = VersionGroup.fromPath(versionGroup)
        return lapisProxyService.proxyPost(
            config.lapisUrl,
            lapisPath,
            prepareBody(body, vg, groupIdsFor(authenticatedUser)),
            accept,
        )
    }

    private fun get(
        organism: String,
        versionGroup: String,
        lapisPath: String,
        request: HttpServletRequest,
        authenticatedUser: AuthenticatedUser,
        accept: String?,
    ): ResponseEntity<StreamingResponseBody> {
        val config = getInstanceConfig(organism)
        val vg = VersionGroup.fromPath(versionGroup)
        return lapisProxyService.proxyGet(
            config.lapisUrl,
            lapisPath,
            prepareQuery(request.queryString, vg, groupIdsFor(authenticatedUser)),
            accept,
        )
    }

    @PostMapping("/{versionGroup}/metadata")
    fun metadata(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/details", body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/aggregated")
    fun aggregated(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/aggregated", body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/sequences")
    fun sequences(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/unalignedNucleotideSequences", body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/sequencesAligned")
    fun sequencesAligned(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/alignedNucleotideSequences", body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/sequencesAligned/mutations")
    fun sequencesAlignedMutations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/nucleotideMutations", body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/sequencesAligned/aggregatedMutations")
    fun sequencesAlignedAggregatedMutations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/nucleotideMutations", body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/sequencesAligned/{referenceName}")
    fun sequencesAlignedForSegment(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable referenceName: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(
        organism,
        versionGroup,
        "/sample/alignedNucleotideSequences/$referenceName",
        body,
        authenticatedUser,
        accept,
    )

    @PostMapping("/{versionGroup}/sequencesAligned/{referenceName}/mutations")
    fun sequencesAlignedForSegmentMutations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable referenceName: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/nucleotideMutations", body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/sequencesAligned/{referenceName}/aggregatedMutations")
    fun sequencesAlignedForSegmentAggregatedMutations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable referenceName: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/nucleotideMutations", body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/translations/{geneName}")
    fun translations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable geneName: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/alignedAminoAcidSequences/$geneName", body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/translations/{geneName}/mutations")
    fun translationsMutations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable geneName: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/aminoAcidMutations", body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/translations/{geneName}/aggregatedMutations")
    fun translationsAggregatedMutations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable geneName: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, "/sample/aminoAcidMutations", body, authenticatedUser, accept)

    @GetMapping("/{versionGroup}/metadata")
    fun metadataGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(organism, versionGroup, "/sample/details", request, authenticatedUser, accept)

    @GetMapping("/{versionGroup}/sequences")
    fun sequencesGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(organism, versionGroup, "/sample/unalignedNucleotideSequences", request, authenticatedUser, accept)

    @GetMapping("/{versionGroup}/sequences/{segment}")
    fun sequencesForSegmentGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable segment: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(organism, versionGroup, "/sample/unalignedNucleotideSequences/$segment", request, authenticatedUser, accept)

    @GetMapping("/{versionGroup}/sequencesAligned")
    fun sequencesAlignedGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(organism, versionGroup, "/sample/alignedNucleotideSequences", request, authenticatedUser, accept)

    @GetMapping("/{versionGroup}/sequencesAligned/{referenceName}")
    fun sequencesAlignedForSegmentGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable referenceName: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(
        organism,
        versionGroup,
        "/sample/alignedNucleotideSequences/$referenceName",
        request,
        authenticatedUser,
        accept,
    )

    @GetMapping("/{versionGroup}/translations/{geneName}")
    fun translationsGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable geneName: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(organism, versionGroup, "/sample/alignedAminoAcidSequences/$geneName", request, authenticatedUser, accept)
}
