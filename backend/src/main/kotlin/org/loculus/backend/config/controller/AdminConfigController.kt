package org.loculus.backend.config.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import kotlinx.datetime.LocalDateTime
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.config.InstanceConfig
import org.loculus.backend.config.OrganismConfig
import org.loculus.backend.config.operations.OperationRequest
import org.loculus.backend.config.operations.OperationValidationException
import org.loculus.backend.config.operations.UnknownOperationException
import org.loculus.backend.config.operations.ValidationError
import org.loculus.backend.config.service.AuditLogService
import org.loculus.backend.config.service.ConfigService
import org.loculus.backend.config.service.DraftScopeMismatchException
import org.loculus.backend.config.service.DraftService
import org.loculus.backend.config.service.NoDraftToPublishException
import org.loculus.backend.config.service.OptimisticConcurrencyException
import org.loculus.backend.config.service.OrganismAdminService
import org.loculus.backend.config.service.OrganismAlreadyExistsException
import org.loculus.backend.config.service.OrganismDeploymentException
import org.loculus.backend.config.service.OrganismNotFoundException
import org.loculus.backend.config.service.PreprocessingConfigService
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/admin/config")
@SecurityRequirement(name = "bearerAuth")
class AdminConfigController(
    private val configService: ConfigService,
    private val organismAdminService: OrganismAdminService,
    private val draftService: DraftService,
    private val auditLogService: AuditLogService,
    private val preprocessingConfigService: PreprocessingConfigService,
) {
    @Operation(description = "Create a new unreleased organism.")
    @PostMapping("/organisms")
    @ResponseStatus(HttpStatus.CREATED)
    fun createOrganism(
        @RequestBody body: CreateOrganismRequest,
        authenticatedUser: AuthenticatedUser,
    ): ConfigService.OrganismListing = organismAdminService.createOrganism(body.key, authenticatedUser.username)

    @Operation(description = "List all organisms including unreleased ones.")
    @GetMapping("/organisms")
    fun listOrganisms(): AdminOrganismsListResponse =
        AdminOrganismsListResponse(organisms = configService.listAllOrganisms())

    @Operation(description = "Get the current draft for an organism (200) or no-content (204) if no draft.")
    @GetMapping("/organisms/{key}/draft")
    fun getOrganismDraft(@PathVariable key: String): ResponseEntity<OrganismDraftResponse> {
        val draft = draftService.getOrganismDraft(key)
            ?: return ResponseEntity.noContent().build()
        return ResponseEntity.ok(OrganismDraftResponse.from(draft))
    }

    @Operation(description = "Replace the entire draft for an UNRELEASED organism. 403 if released.")
    @PutMapping("/organisms/{key}/draft")
    fun putOrganismDraft(
        @PathVariable key: String,
        @RequestBody body: PutDraftRequest<OrganismConfig>,
        @RequestHeader(value = "If-Match", required = false) ifMatch: Long?,
        authenticatedUser: AuthenticatedUser,
    ): DraftMutationResponse {
        val newRevision = draftService.putOrganismDraft(key, body.config, ifMatch, authenticatedUser.username)
        return DraftMutationResponse(revision = newRevision)
    }

    @Operation(description = "Append operation(s) to a RELEASED organism's draft. 403 if unreleased.")
    @PostMapping("/organisms/{key}/draft/operations")
    fun appendOrganismOperations(
        @PathVariable key: String,
        @RequestBody body: AppendOperationsRequest,
        @RequestHeader(value = "If-Match", required = false) ifMatch: Long?,
        authenticatedUser: AuthenticatedUser,
    ): DraftMutationResponse {
        val newRevision = draftService.appendOrganismOperations(
            key = key,
            ops = body.operations,
            ifMatch = ifMatch,
            actor = authenticatedUser.username,
        )
        return DraftMutationResponse(revision = newRevision)
    }

    @Operation(description = "Discard the entire draft for an organism.")
    @DeleteMapping("/organisms/{key}/draft")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun discardOrganismDraft(@PathVariable key: String, authenticatedUser: AuthenticatedUser) {
        draftService.discardOrganismDraft(key, authenticatedUser.username)
    }

    @Operation(description = "Publish the current draft as a new immutable organism version.")
    @PostMapping("/organisms/{key}/publish")
    fun publishOrganism(@PathVariable key: String, authenticatedUser: AuthenticatedUser): PublishResponse {
        val result = draftService.publishOrganism(key, authenticatedUser.username)
        return PublishResponse(
            version = result.version,
            previousVersion = result.previousVersion,
            publishedAt = result.publishedAt,
            publishedBy = result.publishedBy,
        )
    }

    @Operation(
        description = "Mark a released organism as deployed after SILO/LAPIS have been rolled out and checked.",
    )
    @PostMapping("/organisms/{key}/mark-deployed")
    fun markOrganismDeployed(
        @PathVariable key: String,
        authenticatedUser: AuthenticatedUser,
    ): ConfigService.OrganismListing = organismAdminService.markDeployed(key, authenticatedUser.username)

    @Operation(description = "List known versions of an organism config.")
    @GetMapping("/organisms/{key}/versions")
    fun listOrganismVersions(@PathVariable key: String) = VersionsResponse(
        versions = configService.listOrganismVersions(key),
    )

    @Operation(description = "Get the current instance config draft, if any.")
    @GetMapping("/instance/draft")
    fun getInstanceDraft(): ResponseEntity<InstanceDraftResponse> {
        val draft = draftService.getInstanceDraft() ?: return ResponseEntity.noContent().build()
        return ResponseEntity.ok(
            InstanceDraftResponse(config = draft.config, baseVersion = draft.baseVersion, revision = draft.revision),
        )
    }

    @Operation(description = "Replace the entire instance config draft (full-document PUT).")
    @PutMapping("/instance/draft")
    fun putInstanceDraft(
        @RequestBody body: PutDraftRequest<InstanceConfig>,
        @RequestHeader(value = "If-Match", required = false) ifMatch: Long?,
        authenticatedUser: AuthenticatedUser,
    ): DraftMutationResponse {
        val newRevision = draftService.putInstanceDraft(body.config, ifMatch, authenticatedUser.username)
        return DraftMutationResponse(revision = newRevision)
    }

    @Operation(description = "Append operation(s) to the instance config draft.")
    @PostMapping("/instance/draft/operations")
    fun appendInstanceOperations(
        @RequestBody body: AppendOperationsRequest,
        @RequestHeader(value = "If-Match", required = false) ifMatch: Long?,
        authenticatedUser: AuthenticatedUser,
    ): DraftMutationResponse {
        val newRevision = draftService.appendInstanceOperations(
            ops = body.operations,
            ifMatch = ifMatch,
            actor = authenticatedUser.username,
        )
        return DraftMutationResponse(revision = newRevision)
    }

    @Operation(description = "Discard the instance config draft.")
    @DeleteMapping("/instance/draft")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun discardInstanceDraft(authenticatedUser: AuthenticatedUser) {
        draftService.discardInstanceDraft(authenticatedUser.username)
    }

    @Operation(description = "Publish the instance config draft as a new version.")
    @PostMapping("/instance/publish")
    fun publishInstance(authenticatedUser: AuthenticatedUser): PublishResponse {
        val result = draftService.publishInstance(authenticatedUser.username)
        return PublishResponse(
            version = result.version,
            previousVersion = result.previousVersion,
            publishedAt = result.publishedAt,
            publishedBy = result.publishedBy,
        )
    }

    @Operation(description = "List known versions of the instance config.")
    @GetMapping("/instance/versions")
    fun listInstanceVersions() = VersionsResponse(versions = configService.listInstanceVersions())

    @Operation(
        description = "Create or replace the opaque preprocessing config file for an organism + " +
            "pipeline version. The body is stored verbatim; it is not versioned and not interpreted.",
    )
    @PutMapping(
        "/organisms/{key}/preprocessing/{pipelineVersion}",
        consumes = [MediaType.TEXT_PLAIN_VALUE, MediaType.APPLICATION_OCTET_STREAM_VALUE],
    )
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun putPreprocessingConfig(
        @PathVariable key: String,
        @PathVariable pipelineVersion: Long,
        @RequestBody content: String,
        authenticatedUser: AuthenticatedUser,
    ) {
        preprocessingConfigService.setConfigFile(key, pipelineVersion, content, authenticatedUser.username)
    }

    @Operation(description = "Delete the preprocessing config file for an organism + pipeline version.")
    @DeleteMapping("/organisms/{key}/preprocessing/{pipelineVersion}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deletePreprocessingConfig(
        @PathVariable key: String,
        @PathVariable pipelineVersion: Long,
        authenticatedUser: AuthenticatedUser,
    ) {
        preprocessingConfigService.deleteConfigFile(key, pipelineVersion)
    }

    @Operation(description = "Recent audit-log entries scoped to one organism, or to instance config.")
    @GetMapping("/audit")
    fun audit(
        @org.springframework.web.bind.annotation.RequestParam(required = false) organism: String?,
    ): AuditResponse = if (organism != null) {
        AuditResponse(entries = auditLogService.listForOrganism(organism))
    } else {
        AuditResponse(entries = auditLogService.listInstance())
    }

    @ExceptionHandler(OrganismAlreadyExistsException::class)
    fun handleAlreadyExists(e: OrganismAlreadyExistsException) =
        errorResponse("organism_already_exists", e.message, HttpStatus.CONFLICT)

    @ExceptionHandler(OrganismNotFoundException::class)
    fun handleOrganismNotFound(e: OrganismNotFoundException) =
        errorResponse("organism_not_found", e.message, HttpStatus.NOT_FOUND)

    @ExceptionHandler(DraftScopeMismatchException::class)
    fun handleScopeMismatch(e: DraftScopeMismatchException) =
        errorResponse("draft_scope_mismatch", e.message, HttpStatus.FORBIDDEN)

    @ExceptionHandler(OptimisticConcurrencyException::class)
    fun handleConcurrency(e: OptimisticConcurrencyException) =
        errorResponse("revision_conflict", e.message, HttpStatus.CONFLICT)

    @ExceptionHandler(NoDraftToPublishException::class)
    fun handleNoDraftToPublish(e: NoDraftToPublishException) =
        errorResponse("no_draft_to_publish", e.message, HttpStatus.CONFLICT)

    @ExceptionHandler(OrganismDeploymentException::class)
    fun handleDeploymentException(e: OrganismDeploymentException) =
        errorResponse("invalid_deployment_state", e.message, HttpStatus.CONFLICT)

    @ExceptionHandler(UnknownOperationException::class)
    fun handleUnknownOp(e: UnknownOperationException): ResponseEntity<Map<String, Any?>> = ResponseEntity(
        mapOf("error" to "unknown_operation", "opType" to e.opType, "message" to e.message),
        HttpStatus.BAD_REQUEST,
    )

    @ExceptionHandler(OperationValidationException::class)
    fun handleOpValidation(e: OperationValidationException): ResponseEntity<Map<String, Any?>> = ResponseEntity(
        mapOf(
            "error" to "operation_validation_failed",
            "errors" to e.errors.map { mapOf("path" to it.path, "message" to it.message) },
        ),
        HttpStatus.BAD_REQUEST,
    )

    @ExceptionHandler(IllegalArgumentException::class)
    fun handleBadRequest(e: IllegalArgumentException) =
        errorResponse("bad_request", e.message ?: "Invalid input", HttpStatus.BAD_REQUEST)

    private fun errorResponse(code: String, message: String?, status: HttpStatus) =
        ResponseEntity(mapOf("error" to code, "message" to (message ?: "")), status)
}

data class CreateOrganismRequest(val key: String)

data class AdminOrganismsListResponse(val organisms: List<ConfigService.OrganismListing>)

data class PutDraftRequest<T>(val config: T)

data class AppendOperationsRequest(val operations: List<OperationRequest>)

data class DraftMutationResponse(val revision: Long)

data class PublishResponse(
    val version: Long,
    val previousVersion: Long?,
    val publishedAt: LocalDateTime,
    val publishedBy: String,
)

data class VersionsResponse(val versions: List<ConfigService.VersionListing>)

data class AuditResponse(val entries: List<AuditLogService.AuditEntry>)

data class OrganismDraftResponse(
    val config: OrganismConfig,
    val baseVersion: Long?,
    val revision: Long,
    val operations: List<DraftService.PendingOp>,
) {
    companion object {
        fun from(v: DraftService.OrganismDraftView) = OrganismDraftResponse(
            config = v.config,
            baseVersion = v.baseVersion,
            revision = v.revision,
            operations = v.operations,
        )
    }
}

data class InstanceDraftResponse(val config: InstanceConfig, val baseVersion: Long?, val revision: Long)
