package org.loculus.backend.api.v1

import org.loculus.backend.config.V1_API_VERSION
import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configurers.AuthorizeHttpRequestsConfigurer

private val getEndpointsThatArePublic = arrayOf(
    // Enables 'GET /$V1_API_VERSION/groups/{groupId}' endpoint to be public
    "/$V1_API_VERSION/groups/*",
    // Enables 'GET /$V1_API_VERSION/query/metadata' endpoint to be public
    "/$V1_API_VERSION/query/metadata",
)

fun v1AccessRules(auth: AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry) {
    auth.requestMatchers(HttpMethod.GET, *getEndpointsThatArePublic).permitAll()
}
