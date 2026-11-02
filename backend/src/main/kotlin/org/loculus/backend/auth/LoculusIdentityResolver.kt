package org.loculus.backend.auth

import org.loculus.backend.config.BackendConfig
import org.loculus.backend.errors.UnauthorizedException
import org.loculus.backend.service.identity.IdentityProvisioningService
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Service

@Service
class LoculusIdentityResolver(
    private val provisioning: IdentityProvisioningService,
    private val config: BackendConfig,
) {
    /** Call only with the JWT authenticated by Spring, never with independently decoded client input. */
    fun resolve(jwt: Jwt): LoculusPrincipal {
        val issuer = jwt.getClaimAsString("iss")?.takeUnless { it.isBlank() }
            ?: throw UnauthorizedException("Token is missing a usable issuer.")
        val subject = jwt.getClaimAsString("sub")?.takeUnless { it.isBlank() }
            ?: throw UnauthorizedException("Token is missing a usable subject.")
        return provisioning.ensure(
            ExternalIdentity(issuer, subject),
            jwt.getClaimAsString("preferred_username"),
            !config.readOnlyMode,
        )
    }
}
