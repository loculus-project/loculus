package org.loculus.backend.service.identity.provider

import jakarta.ws.rs.ProcessingException
import jakarta.ws.rs.WebApplicationException
import org.loculus.backend.auth.ExternalIdentity
import org.loculus.backend.service.KeycloakAdapter
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

@Component
class KeycloakProfileReader(
    private val keycloak: KeycloakAdapter,
    @param:Value("\${spring.security.oauth2.resourceserver.jwt.issuer-uri}") private val issuer: String,
) : IdentityProviderProfileReader {
    override fun readProfile(identity: ExternalIdentity): ProviderProfileSeed {
        // The configured adapter fixes the server/realm. Never use an incoming issuer as a request URL.
        require(identity.issuer == issuer) { "No profile reader configured for this issuer." }
        val user = try {
            keycloak.getUserById(identity.subject)
        } catch (error: ProcessingException) {
            throw IdentityProviderUnavailableException(error)
        } catch (error: WebApplicationException) {
            // A missing/deleted account must not silently fall back to provisioning from an old token.
            if (error.response.status < 500 && error.response.status != 429) throw error
            throw IdentityProviderUnavailableException(error)
        }
        check(user.id == identity.subject) { "Provider returned a different account." }
        return ProviderProfileSeed(
            username = user.username,
            givenName = user.firstName,
            familyName = user.lastName,
            affiliation = user.attributes?.get("university")?.singleOrNull(),
            // Existing ORCID broker mapping uses orcid.path; this is a profile value, not ownership proof.
            orcidId = user.attributes?.get("orcid.path")?.singleOrNull()
                ?: user.attributes?.get("orcid")?.singleOrNull(),
            email = user.email?.takeUnless { it.isBlank() },
            emailVerified = user.isEmailVerified,
        )
    }
}
