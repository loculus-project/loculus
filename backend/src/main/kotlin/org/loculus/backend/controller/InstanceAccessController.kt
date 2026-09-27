package org.loculus.backend.controller

import org.loculus.backend.auth.InstanceAccessPolicy
import org.loculus.backend.auth.InstanceActorAdapter
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

data class InstanceAccess(
    val canReadReleasedData: Boolean,
    val canContribute: Boolean,
    val canManageMembership: Boolean,
)

@RestController
class InstanceAccessController(private val policy: InstanceAccessPolicy, private val actors: InstanceActorAdapter) {
    @GetMapping("/access/capabilities")
    fun capabilities(authentication: Authentication?): ResponseEntity<InstanceAccess> {
        val actor = actors.resolve(authentication)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
            InstanceAccess(
                policy.canReadReleasedData(actor),
                policy.canContribute(actor),
                policy.canManageMembership(actor),
            ),
        )
    }
}
