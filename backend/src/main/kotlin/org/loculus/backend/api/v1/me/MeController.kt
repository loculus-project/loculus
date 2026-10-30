package org.loculus.backend.api.v1.me

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.headers.Header
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.loculus.backend.auth.LoculusIdentityResolver
import org.springframework.http.CacheControl
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@SecurityRequirement(name = "bearerAuth")
class MeController(private val identities: LoculusIdentityResolver) {
    @GetMapping("/v1/me")
    @Operation(
        description = "Return the caller's Loculus identity, provisioning it on first use. " +
            "Existing identities remain available in read-only mode; new identities cannot be provisioned then.",
    )
    @ApiResponses(
        value = [
            ApiResponse(
                responseCode = "200",
                description = "Loculus user ID and provisioning timestamp, including on first use.",
                headers = [
                    Header(
                        name = "Cache-Control",
                        schema = Schema(type = "string", allowableValues = ["no-store"]),
                    ),
                ],
            ),
            ApiResponse(
                responseCode = "401",
                description = "Missing or invalid bearer token, or unusable identity claims.",
                content = [Content()],
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
    fun me(@Parameter(hidden = true) @AuthenticationPrincipal jwt: Jwt): ResponseEntity<MeResponse> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(identities.resolve(jwt).toResponse())
}
