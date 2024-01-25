package org.loculus.backend.service

import org.keycloak.admin.client.KeycloakBuilder
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

private const val PREFIX = "keycloak"

@Component
class KeycloakAdapter(
    @Value("\${$PREFIX.user}") private val user: String,
    @Value("\${$PREFIX.password}") private val password: String,
    @Value("\${$PREFIX.realm}") private val realm: String,
    @Value("\${$PREFIX.client}") private val client: String,
    @Value("\${$PREFIX.url}") private val url: String,
) {

    fun getUsersWithName(username: String) = KeycloakBuilder.builder()
        .serverUrl(url)
        .realm(realm)
        .clientId(client)
        .username(user)
        .password(password)
        .build()
        .realm(realm)
        .users()
        .search(username, true)
}
