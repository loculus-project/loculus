package org.loculus.backend.api.v1.groups

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.headers.Header
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import jakarta.validation.Valid
import org.loculus.backend.auth.LoculusIdentityResolver
import org.loculus.backend.service.groupmanagement.GroupService
import org.springframework.http.CacheControl
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.net.URI

@RestController
class GroupController(private val identities: LoculusIdentityResolver, private val groups: GroupService) {
    @GetMapping("/v1/groups")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(description = "List the caller's memberships; superusers do not bypass membership filtering.")
    @ApiResponses(
        value = [
            ApiResponse(
                responseCode = "200",
                description = "Memberships ordered by ascending group ID.",
                headers = [
                    Header(
                        name = "Cache-Control",
                        schema = Schema(type = "string", allowableValues = ["no-store"]),
                    ),
                ],
            ),
            ApiResponse(
                responseCode = "400",
                description = "Invalid pagination parameters.",
                content = [
                    Content(
                        mediaType = "application/problem+json",
                        schema = Schema(implementation = ProblemDetail::class),
                    ),
                ],
            ),
            ApiResponse(
                responseCode = "401",
                description = "Missing or invalid bearer token, or unusable identity claims.",
                content = [Content()],
            ),
            ApiResponse(
                responseCode = "403",
                description = "The identity has no usable stored membership username.",
                content = [
                    Content(
                        mediaType = "application/problem+json",
                        schema = Schema(implementation = ProblemDetail::class),
                    ),
                ],
            ),
            ApiResponse(
                responseCode = "503",
                description = "Identity storage is unavailable, or read-only mode prevents first-use provisioning.",
                content = [
                    Content(
                        mediaType = "application/problem+json",
                        schema = Schema(implementation = ProblemDetail::class),
                    ),
                ],
            ),
        ],
    )
    fun list(
        @Parameter(hidden = true) @AuthenticationPrincipal jwt: Jwt,
        @Parameter(
            description = "Maximum number of groups to return.",
            schema = Schema(minimum = "1", maximum = "100", defaultValue = "50"),
        )
        @RequestParam(defaultValue = "50") limit: Int,
        @Parameter(
            description = "Return groups with IDs greater than this value. Use nextAfter from the " +
                "previous page; 0 starts the first page.",
            schema = Schema(minimum = "0", defaultValue = "0"),
        )
        @RequestParam(defaultValue = "0") after: Int,
    ): ResponseEntity<GroupPageResponse> = ResponseEntity.ok().cacheControl(CacheControl.noStore())
        .body(groups.list(identities.resolve(jwt), limit, after).toResponse())

    // Demonstrates optional authentication and field-level visibility: public details are available to
    // everyone, while authenticated callers also receive email and members. The service applies this policy.
    @GetMapping("/v1/groups/{groupId}")
    @Operation(
        description = "Public group details. Authentication is optional: a valid bearer token " +
            "includes contact email and members, regardless of membership. Invalid supplied tokens are rejected. This endpoint does not provision a Loculus identity.",
    )
    @ApiResponses(
        value = [
            ApiResponse(
                responseCode = "200",
                description = "Group details, with email and members null for anonymous callers.",
                headers = [
                    Header(
                        name = "Cache-Control",
                        schema = Schema(type = "string", allowableValues = ["no-store"]),
                    ),
                ],
            ),
            ApiResponse(
                responseCode = "400",
                description = "Invalid group ID.",
                content = [
                    Content(
                        mediaType = "application/problem+json",
                        schema = Schema(implementation = ProblemDetail::class),
                    ),
                ],
            ),
            ApiResponse(responseCode = "401", description = "Invalid supplied bearer token.", content = [Content()]),
            ApiResponse(
                responseCode = "404",
                description = "Group does not exist.",
                content = [
                    Content(
                        mediaType = "application/problem+json",
                        schema = Schema(implementation = ProblemDetail::class),
                    ),
                ],
            ),
        ],
    )
    fun details(
        @Parameter(description = "ID of the group to retrieve.", schema = Schema(minimum = "1"))
        @PathVariable groupId: Int,
        @Parameter(hidden = true) @AuthenticationPrincipal jwt: Jwt?,
    ): ResponseEntity<GroupDetailsResponse> = ResponseEntity.ok().cacheControl(CacheControl.noStore())
        // No identity resolution or JIT here: visibility only depends on successful authentication.
        .body(groups.details(groupId, authenticated = jwt != null).toResponse())

    @PostMapping("/v1/groups")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(
        description = "Create a group and add the caller as a member. Human and service accounts " +
            "are eligible. Unknown request fields are rejected. Duplicate names are allowed; requests are not idempotent.",
    )
    @ApiResponses(
        value = [
            ApiResponse(
                responseCode = "201",
                description = "Group created, including creator membership and audit entry.",
                content = [
                    Content(
                        mediaType = "application/json",
                        schema = Schema(implementation = CreateGroupResponse::class),
                    ),
                ],
                headers = [
                    Header(
                        name = "Location",
                        description = "Relative URL of the created group.",
                        schema = Schema(type = "string", example = "/v1/groups/42"),
                    ), Header(name = "Cache-Control", schema = Schema(type = "string", allowableValues = ["no-store"])),
                ],
            ),
            ApiResponse(
                responseCode = "400",
                description = "Invalid request body, including unknown fields.",
                content = [
                    Content(
                        mediaType = "application/problem+json",
                        schema = Schema(implementation = ProblemDetail::class),
                    ),
                ],
            ),
            ApiResponse(
                responseCode = "401",
                description = "Missing or invalid bearer token, or unusable identity claims.",
                content = [Content()],
            ),
            ApiResponse(
                responseCode = "403",
                description = "The identity has no usable stored creator username.",
                content = [
                    Content(
                        mediaType = "application/problem+json",
                        schema = Schema(implementation = ProblemDetail::class),
                    ),
                ],
            ),
            ApiResponse(
                responseCode = "503",
                description = "Read-only mode prevents creation, or identity storage is unavailable.",
                content = [
                    Content(
                        mediaType = "application/problem+json",
                        schema = Schema(implementation = ProblemDetail::class),
                    ),
                ],
            ),
        ],
    )
    fun create(
        @Parameter(hidden = true) @AuthenticationPrincipal jwt: Jwt,
        @Valid @RequestBody request: CreateGroupRequest,
    ): ResponseEntity<CreateGroupResponse> {
        val group = groups.create(identities.resolve(jwt), request.toServiceInput())
        return ResponseEntity.created(URI.create("/v1/groups/${group.groupId}"))
            .cacheControl(CacheControl.noStore())
            .body(group.toResponse())
    }
}
