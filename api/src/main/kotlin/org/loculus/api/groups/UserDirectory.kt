package org.loculus.api.groups

import org.keycloak.admin.client.KeycloakBuilder
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.stereotype.Component

/**
 * Looks up users in the identity provider.
 */
interface UserDirectory {
    fun userExists(username: String): Boolean
}

@ConfigurationProperties(prefix = "keycloak")
data class KeycloakProperties(
    val user: String,
    val password: String,
    val realm: String,
    val client: String,
    val url: String,
)

@Component
class KeycloakUserDirectory(private val properties: KeycloakProperties) : UserDirectory {
    private val realm by lazy {
        KeycloakBuilder.builder()
            .serverUrl(properties.url)
            .realm(properties.realm)
            .clientId(properties.client)
            .username(properties.user)
            .password(properties.password)
            .build()
            .realm(properties.realm)
    }

    override fun userExists(username: String): Boolean {
        val users = realm.users().search(username, true)
        check(users.size <= 1) { "Multiple users with name $username exist." }
        return users.isNotEmpty()
    }
}
