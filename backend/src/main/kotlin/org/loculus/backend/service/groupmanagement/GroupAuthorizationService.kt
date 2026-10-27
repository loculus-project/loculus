package org.loculus.backend.service.groupmanagement

import org.loculus.backend.auth.LoculusPrincipal
import org.loculus.backend.errors.ForbiddenException
import org.loculus.backend.service.identity.IdentityDatabaseService
import org.springframework.stereotype.Service

@Service
class GroupAuthorizationService(private val identities: IdentityDatabaseService) {
    // Group memberships still store usernames, so use the username saved when this identity was linked.
    // Username-based membership is also the CURRENT behaviour of existing endpoints, not a new policy.
    // Keycloak currently prevents username edits; non-reassignment remains an assumption, not a guarantee.
    // Replace this with Loculus user ID lookups before v1 stabilises.
    fun membershipUsername(actor: LoculusPrincipal): String =
        identities.findUsername(actor)?.takeUnless { it.isBlank() }
            ?: throw ForbiddenException("Group access temporarily requires a linked username.")

    fun canViewPrivateDetails(authenticated: Boolean): Boolean = authenticated
}
