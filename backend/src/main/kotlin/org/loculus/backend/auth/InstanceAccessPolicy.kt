package org.loculus.backend.auth

import org.loculus.backend.config.BackendSpringProperty
import org.springframework.beans.factory.annotation.Value
import org.springframework.security.authentication.AnonymousAuthenticationToken
import org.springframework.security.core.Authentication
import org.springframework.stereotype.Component

/** Temporary provider adapter. Application policy consumes capabilities, not JWT claims. */
@Component
class InstanceActorAdapter {
    fun resolve(authentication: Authentication?): InstanceActor {
        val authenticated = authentication != null && authentication.isAuthenticated &&
            authentication !is AnonymousAuthenticationToken
        val roles = authentication?.authorities?.map { it.authority }?.toSet().orEmpty()
        return InstanceActor(
            authenticated = authenticated,
            contributor = authenticated && ("contributor" in roles || Roles.SUPER_USER in roles),
            administrator = authenticated && Roles.SUPER_USER in roles,
        )
    }
}

data class InstanceActor(val authenticated: Boolean, val contributor: Boolean, val administrator: Boolean)

/** Restricted mode adds a capability gate; existing resource/group checks still apply. */
@Component
class InstanceAccessPolicy(
    @Value("\${${BackendSpringProperty.REQUIRE_AUTHENTICATION}:false}") val restricted: Boolean,
) {
    fun canReadReleasedData(actor: InstanceActor): Boolean = !restricted || actor.authenticated
    fun canContribute(actor: InstanceActor): Boolean = actor.authenticated && (!restricted || actor.contributor)
    fun canManageMembership(actor: InstanceActor): Boolean = actor.authenticated && (!restricted || actor.administrator)
}
