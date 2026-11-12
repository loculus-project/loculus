package org.loculus.backend.api.v1

import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configurers.AuthorizeHttpRequestsConfigurer

private val getEndpointsThatArePublic = arrayOf(
    // Enables 'GET /v1/groups/{groupId}' endpoint to be public
    "/v1/groups/*",
)

fun v1AccessRules(auth: AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry) {
    auth.requestMatchers(HttpMethod.GET, *getEndpointsThatArePublic).permitAll()
}
