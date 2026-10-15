package org.loculus.backend.service

import org.keycloak.admin.client.KeycloakBuilder
import org.keycloak.representations.idm.UserRepresentation
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.stereotype.Component

@ConfigurationProperties(prefix = "keycloak")
data class KeycloakProperties(
    val user: String,
    val password: String,
    val realm: String,
    val client: String,
    val url: String,
)

@Component
class KeycloakAdapter(private val keycloakProperties: KeycloakProperties) {

    private val keycloakRealm = KeycloakBuilder.builder()
        .serverUrl(keycloakProperties.url)
        .realm(keycloakProperties.realm)
        .clientId(keycloakProperties.client)
        .username(keycloakProperties.user)
        .password(keycloakProperties.password)
        .build()
        .realm(keycloakProperties.realm)

    fun getUsersWithName(username: String): List<UserRepresentation> = keycloakRealm
        .users()
        .search(username, true)!!
}
