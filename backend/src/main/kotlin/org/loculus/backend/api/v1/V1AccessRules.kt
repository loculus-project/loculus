package org.loculus.backend.api.v1

import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configurers.AuthorizeHttpRequestsConfigurer

// Route-level authentication requirements; resource permissions belong in application services.
// v1 uses Spring's default JWT converter: scopes become SCOPE_* authorities, but Keycloak realm roles
// are not mapped. Rules such as hasAuthority(SUPER_USER) will not match without explicit role mapping.
fun v1AccessRules(auth: AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry) {
    auth.requestMatchers(HttpMethod.GET, "/v1/me").authenticated()
}
