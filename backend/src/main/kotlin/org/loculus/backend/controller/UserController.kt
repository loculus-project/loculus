package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.api.UserProfile
import org.loculus.backend.service.KeycloakAdapter
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController

@RestController
@SecurityRequirement(name = "bearerAuth")
class UserController(private val keycloakAdapter: KeycloakAdapter) {

    @Operation(description = "Get public profile information for a user")
    @GetMapping("/users/{username}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getUser(
        @Parameter(description = "The username of the user to fetch.")
        @PathVariable username: String,
    ): UserProfile {
        val keycloakUser = keycloakAdapter.getUsersWithName(username).firstOrNull()
            ?: throw NotFoundException("User profile $username does not exist")

        return keycloakUser.toUserProfile()
    }

    private fun UserRepresentation.toUserProfile(): UserProfile {
        val emailDomain = email?.substringAfterLast("@") ?: ""
        return UserProfile(
            username,
            firstName,
            lastName,
            emailDomain,
            attributes["university"]?.firstOrNull(),
        )
    }
}
