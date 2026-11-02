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
class KeycloakAdapter(private val keycloakProperties: KeycloakProperties) : AutoCloseable {

    private val client = KeycloakBuilder.builder()
        .serverUrl(keycloakProperties.url)
        .realm(keycloakProperties.realm)
        .clientId(keycloakProperties.client)
        .username(keycloakProperties.user)
        .password(keycloakProperties.password)
        .build()

    private val keycloakRealm get() = client.realm(keycloakProperties.realm)

    fun getUsersWithName(username: String): List<UserRepresentation> = keycloakRealm
        .users()
        .search(username, true)!!

    fun getUsersPage(first: Int, max: Int): List<UserRepresentation> {
        require(first >= 0 && max in 1..1000)
        // A plain list/search excludes client service accounts in Keycloak. An explicit exact filter
        // uses its attribute-search path, which includes them. No enabled filter: import disabled users too.
        return keycloakRealm.users().search(null, null, null, null, first, max, null, true, false)
    }

    override fun close() = client.close()
}
