package org.loculus.backend.config.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import kotlinx.datetime.LocalDateTime
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.InstanceConfig
import org.loculus.backend.config.OrganismConfig
import org.loculus.backend.config.expandPerSegmentMetadata
import org.loculus.backend.config.perSegmentExpansionSegments
import org.loculus.backend.config.service.ConfigService
import org.loculus.backend.config.service.OrganismNotFoundException
import org.loculus.backend.config.service.PreprocessingConfigService
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/config")
class PublicConfigController(
    private val configService: ConfigService,
    private val backendConfig: BackendConfig,
    private val preprocessingConfigService: PreprocessingConfigService,
) {

    @Operation(description = "Returns the latest published instance config, or the given version if ?version=N.")
    @GetMapping("/instance")
    fun getInstance(
        @Parameter(description = "Optional version pin") @RequestParam(required = false) version: Long?,
    ): InstanceResponse {
        val versioned = if (version != null) {
            configService.getInstanceVersion(version)
                ?: throw VersionNotFoundException("Instance config version $version is not kept.")
        } else {
            configService.getInstanceConfig()
        }
        return InstanceResponse(
            version = versioned.version,
            publishedAt = versioned.publishedAt,
            config = versioned.config,
            readOnlyMode = backendConfig.readOnlyMode,
        )
    }

    @Operation(description = "Lists released and deployed organisms with their current versions.")
    @GetMapping("/organisms")
    fun listOrganisms(): OrganismsListResponse = OrganismsListResponse(
        organisms = configService.listReleasedOrganisms().map { listing ->
            val organism = configService.getOrganismConfig(listing.key)
            OrganismsListResponse.OrganismSummary(
                key = listing.key,
                // Prefer the canonical OrganismConfig.displayName; fall back to
                // the legacy schema.organismName for organisms whose first
                // PUT'd version pre-dates the displayName field. The unused
                // top-level `organismName` (scientific name) was removed in
                // the 2026-05-28 cleanup.
                displayName = organism.config.displayName ?: organism.config.schema.organismName,
                currentVersion = listing.currentVersion
                    ?: error("released organism with no current_version; invariant violated"),
            )
        },
    )

    @Operation(
        description = "Returns the latest published config for one released organism, " +
            "or the given version if ?version=N.",
    )
    @GetMapping("/organisms/{key}")
    fun getOrganism(
        @PathVariable key: String,
        @Parameter(description = "Optional version pin") @RequestParam(required = false) version: Long?,
    ): OrganismResponse {
        val versioned = if (version != null) {
            configService.getOrganismVersion(key, version)
                ?: throw VersionNotFoundException("Organism $key has no version $version.")
        } else {
            configService.getOrganismConfig(key)
        }
        return OrganismResponse(
            key = versioned.key,
            version = versioned.version,
            publishedAt = versioned.publishedAt,
            config = versioned.config.withEffectiveWebsiteMetadata(),
        )
    }

    @Operation(
        description = "Returns the raw, opaque preprocessing config file for an organism + pipeline " +
            "version, if one is configured (404 otherwise). The backend does not interpret the content.",
    )
    @GetMapping("/organisms/{key}/preprocessing/{pipelineVersion}", produces = [MediaType.TEXT_PLAIN_VALUE])
    fun getPreprocessingConfig(
        @PathVariable key: String,
        @PathVariable pipelineVersion: Long,
    ): ResponseEntity<String> {
        val content = preprocessingConfigService.getConfigFile(key, pipelineVersion)
            ?: return ResponseEntity.notFound().build()
        return ResponseEntity.ok(content)
    }

    @Operation(description = "Lists the pipeline versions that have a preprocessing config file for an organism.")
    @GetMapping("/organisms/{key}/preprocessing")
    fun listPreprocessingConfigs(@PathVariable key: String): PreprocessingConfigListResponse =
        PreprocessingConfigListResponse(versions = preprocessingConfigService.listVersions(key))

    @ExceptionHandler(OrganismNotFoundException::class)
    fun handleOrganismNotFound(e: OrganismNotFoundException): ResponseEntity<Map<String, String>> =
        ResponseEntity(mapOf("error" to "organism_not_found", "message" to e.message!!), HttpStatus.NOT_FOUND)

    @ExceptionHandler(VersionNotFoundException::class)
    fun handleVersionNotFound(e: VersionNotFoundException): ResponseEntity<Map<String, String>> =
        ResponseEntity(mapOf("error" to "version_not_found", "message" to e.message!!), HttpStatus.NOT_FOUND)
}

private fun OrganismConfig.withEffectiveWebsiteMetadata(): OrganismConfig = copy(
    schema = schema.copy(
        metadata = expandPerSegmentMetadata(schema.metadata, perSegmentExpansionSegments(this)),
    ),
)

class VersionNotFoundException(message: String) : RuntimeException(message)

data class InstanceResponse(
    val version: Long,
    val publishedAt: LocalDateTime,
    val config: InstanceConfig,
    val readOnlyMode: Boolean = false,
)

data class OrganismResponse(
    val key: String,
    val version: Long,
    val publishedAt: LocalDateTime,
    val config: OrganismConfig,
)

data class OrganismsListResponse(val organisms: List<OrganismSummary>) {
    data class OrganismSummary(val key: String, val displayName: String, val currentVersion: Long)
}

data class PreprocessingConfigListResponse(val versions: List<PreprocessingConfigService.PreprocessingConfigVersion>)
