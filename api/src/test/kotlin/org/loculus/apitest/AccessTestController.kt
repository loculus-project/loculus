package org.loculus.apitest

import org.loculus.api.common.auth.Public
import org.loculus.api.common.auth.RequiresRole
import org.loculus.api.common.auth.Roles
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Lives outside `org.loculus.api` so that component scanning does not pick it up; tests that need it import it.
 */
@RestController
@RequestMapping("/v2/access-test")
class AccessTestController {
    @Public
    @GetMapping("/public")
    fun public() = "ok"

    @GetMapping("/authenticated")
    fun authenticated() = "ok"

    @RequiresRole(Roles.SUPER_USER)
    @GetMapping("/super-user")
    fun superUser() = "ok"
}
