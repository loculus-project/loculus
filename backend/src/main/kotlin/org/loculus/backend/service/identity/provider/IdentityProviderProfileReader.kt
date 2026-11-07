package org.loculus.backend.service.identity.provider

import org.loculus.backend.auth.ExternalIdentity

/** Provider-neutral boundary; administrative profile lookup is not an operation standardized by OIDC. */
interface IdentityProviderProfileReader {
    fun readProfile(identity: ExternalIdentity): ProviderProfileSeed
}

/** Only provider availability failures permit token-username fallback; programming errors must propagate. */
class IdentityProviderUnavailableException(cause: Throwable) : RuntimeException("Identity provider unavailable.", cause)
