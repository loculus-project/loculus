package org.loculus.backend.controller

import com.fasterxml.jackson.databind.JsonNode
import jakarta.servlet.http.HttpServletRequest
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.auth.HiddenParam
import org.loculus.backend.config.BackendConfig
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
    private val lapisAccessFilter: LapisAccessFilter,
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

    private object LapisSamplePath {
        const val DETAILS = "/sample/details"
        const val AGGREGATED = "/sample/aggregated"
        const val UNALIGNED_NUCLEOTIDE_SEQUENCES = "/sample/unalignedNucleotideSequences"
        const val ALIGNED_NUCLEOTIDE_SEQUENCES = "/sample/alignedNucleotideSequences"
        const val NUCLEOTIDE_MUTATIONS = "/sample/nucleotideMutations"
        const val NUCLEOTIDE_INSERTIONS = "/sample/nucleotideInsertions"
        const val AMINO_ACID_MUTATIONS = "/sample/aminoAcidMutations"
        const val AMINO_ACID_INSERTIONS = "/sample/aminoAcidInsertions"

        fun unalignedNucleotideSequences(segment: String) = "$UNALIGNED_NUCLEOTIDE_SEQUENCES/$segment"

        fun alignedNucleotideSequences(referenceName: String) = "$ALIGNED_NUCLEOTIDE_SEQUENCES/$referenceName"

        fun alignedAminoAcidSequences(geneName: String) = "/sample/alignedAminoAcidSequences/$geneName"
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
            lapisAccessFilter.prepareBody(body, authenticatedUser, vg.lapisFilter),
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
            lapisAccessFilter.prepareQuery(request.queryString, authenticatedUser, vg.lapisFilter),
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
    ) = post(organism, versionGroup, LapisSamplePath.DETAILS, body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/aggregated")
    fun aggregated(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, LapisSamplePath.AGGREGATED, body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/sequences")
    fun sequences(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, LapisSamplePath.UNALIGNED_NUCLEOTIDE_SEQUENCES, body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/sequences/{segment}")
    fun sequencesForSegment(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable segment: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(
        organism,
        versionGroup,
        LapisSamplePath.unalignedNucleotideSequences(segment),
        body,
        authenticatedUser,
        accept,
    )

    @PostMapping("/{versionGroup}/sequencesAligned")
    fun sequencesAligned(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, LapisSamplePath.ALIGNED_NUCLEOTIDE_SEQUENCES, body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/sequencesAligned/mutations")
    fun sequencesAlignedMutations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, LapisSamplePath.NUCLEOTIDE_MUTATIONS, body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/sequencesAligned/insertions")
    fun sequencesAlignedInsertions(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, LapisSamplePath.NUCLEOTIDE_INSERTIONS, body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/sequencesAligned/aggregatedMutations")
    fun sequencesAlignedAggregatedMutations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, LapisSamplePath.NUCLEOTIDE_MUTATIONS, body, authenticatedUser, accept)

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
        LapisSamplePath.alignedNucleotideSequences(referenceName),
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
    ) = post(organism, versionGroup, LapisSamplePath.NUCLEOTIDE_MUTATIONS, body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/sequencesAligned/{referenceName}/aggregatedMutations")
    fun sequencesAlignedForSegmentAggregatedMutations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable referenceName: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, LapisSamplePath.NUCLEOTIDE_MUTATIONS, body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/translations/{geneName}")
    fun translations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable geneName: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(
        organism,
        versionGroup,
        LapisSamplePath.alignedAminoAcidSequences(geneName),
        body,
        authenticatedUser,
        accept,
    )

    @PostMapping("/{versionGroup}/translations/mutations")
    fun translationsMutations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, LapisSamplePath.AMINO_ACID_MUTATIONS, body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/translations/insertions")
    fun translationsInsertions(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, LapisSamplePath.AMINO_ACID_INSERTIONS, body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/translations/{geneName}/mutations")
    fun translationsMutations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable geneName: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, LapisSamplePath.AMINO_ACID_MUTATIONS, body, authenticatedUser, accept)

    @PostMapping("/{versionGroup}/translations/{geneName}/aggregatedMutations")
    fun translationsAggregatedMutations(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable geneName: String,
        @RequestBody(required = false) body: JsonNode?,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = post(organism, versionGroup, LapisSamplePath.AMINO_ACID_MUTATIONS, body, authenticatedUser, accept)

    @GetMapping("/{versionGroup}/metadata")
    fun metadataGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(organism, versionGroup, LapisSamplePath.DETAILS, request, authenticatedUser, accept)

    @GetMapping("/{versionGroup}/aggregated")
    fun aggregatedGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(organism, versionGroup, LapisSamplePath.AGGREGATED, request, authenticatedUser, accept)

    @GetMapping("/{versionGroup}/sequences")
    fun sequencesGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(organism, versionGroup, LapisSamplePath.UNALIGNED_NUCLEOTIDE_SEQUENCES, request, authenticatedUser, accept)

    @GetMapping("/{versionGroup}/sequences/{segment}")
    fun sequencesForSegmentGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable segment: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(
        organism,
        versionGroup,
        LapisSamplePath.unalignedNucleotideSequences(segment),
        request,
        authenticatedUser,
        accept,
    )

    @GetMapping("/{versionGroup}/sequencesAligned")
    fun sequencesAlignedGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(organism, versionGroup, LapisSamplePath.ALIGNED_NUCLEOTIDE_SEQUENCES, request, authenticatedUser, accept)

    @GetMapping("/{versionGroup}/sequencesAligned/mutations")
    fun sequencesAlignedMutationsGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(organism, versionGroup, LapisSamplePath.NUCLEOTIDE_MUTATIONS, request, authenticatedUser, accept)

    @GetMapping("/{versionGroup}/sequencesAligned/insertions")
    fun sequencesAlignedInsertionsGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(organism, versionGroup, LapisSamplePath.NUCLEOTIDE_INSERTIONS, request, authenticatedUser, accept)

    @GetMapping("/{versionGroup}/sequencesAligned/aggregatedMutations")
    fun sequencesAlignedAggregatedMutationsGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(organism, versionGroup, LapisSamplePath.NUCLEOTIDE_MUTATIONS, request, authenticatedUser, accept)

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
        LapisSamplePath.alignedNucleotideSequences(referenceName),
        request,
        authenticatedUser,
        accept,
    )

    @GetMapping("/{versionGroup}/sequencesAligned/{referenceName}/mutations")
    fun sequencesAlignedForSegmentMutationsGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable referenceName: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(organism, versionGroup, LapisSamplePath.NUCLEOTIDE_MUTATIONS, request, authenticatedUser, accept)

    @GetMapping("/{versionGroup}/sequencesAligned/{referenceName}/aggregatedMutations")
    fun sequencesAlignedForSegmentAggregatedMutationsGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable referenceName: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(organism, versionGroup, LapisSamplePath.NUCLEOTIDE_MUTATIONS, request, authenticatedUser, accept)

    @GetMapping("/{versionGroup}/translations/{geneName}")
    fun translationsGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable geneName: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(
        organism,
        versionGroup,
        LapisSamplePath.alignedAminoAcidSequences(geneName),
        request,
        authenticatedUser,
        accept,
    )

    @GetMapping("/{versionGroup}/translations/mutations")
    fun translationsMutationsGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(organism, versionGroup, LapisSamplePath.AMINO_ACID_MUTATIONS, request, authenticatedUser, accept)

    @GetMapping("/{versionGroup}/translations/insertions")
    fun translationsInsertionsGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(organism, versionGroup, LapisSamplePath.AMINO_ACID_INSERTIONS, request, authenticatedUser, accept)

    @GetMapping("/{versionGroup}/translations/{geneName}/mutations")
    fun translationsMutationsGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable geneName: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(organism, versionGroup, LapisSamplePath.AMINO_ACID_MUTATIONS, request, authenticatedUser, accept)

    @GetMapping("/{versionGroup}/translations/{geneName}/aggregatedMutations")
    fun translationsAggregatedMutationsGet(
        @PathVariable organism: String,
        @PathVariable versionGroup: String,
        @PathVariable geneName: String,
        request: HttpServletRequest,
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @RequestHeader(HttpHeaders.ACCEPT, required = false) accept: String?,
    ) = get(organism, versionGroup, LapisSamplePath.AMINO_ACID_MUTATIONS, request, authenticatedUser, accept)
}
