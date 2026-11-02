package org.loculus.backend.service.identity

import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.auth.ExternalIdentity
import org.loculus.backend.auth.LoculusPrincipal
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.errors.ServiceUnavailableException
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service

/** Temporary bridge for v0's username input. Membership storage itself uses Loculus IDs. */
@Service
class LegacyMemberIdentityResolver(
    private val provisioning: IdentityProvisioningService,
    private val config: BackendConfig,
    @Value("\${spring.security.oauth2.resourceserver.jwt.issuer-uri}") private val issuer: String,
) {
    fun resolve(user: UserRepresentation): LoculusPrincipal {
        val subject = user.id?.takeIf { it.isNotBlank() }
            ?: throw ServiceUnavailableException("The identity provider returned an account without an ID.")
        return provisioning.ensure(ExternalIdentity(issuer, subject), user.username, !config.readOnlyMode)
    }
}
