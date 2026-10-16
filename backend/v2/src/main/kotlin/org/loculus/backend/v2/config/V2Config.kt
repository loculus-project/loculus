package org.loculus.backend.v2.config

import org.loculus.backend.config.KeycloakAuthenticationConverter
import org.loculus.backend.config.keycloakResourceServer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.web.SecurityFilterChain

@Configuration
class V2Config {

    /**
     * Takes precedence over v1's catch-all filter chain. Every v2 endpoint requires a token, except the public ones
     * listed here. Mark public endpoints with an empty `@SecurityRequirements`, so that the API docs say they need no
     * token (checked by `PublicEndpointsTest`).
     */
    @Bean
    @Order(1)
    fun v2SecurityFilterChain(
        httpSecurity: HttpSecurity,
        keycloakAuthenticationConverter: KeycloakAuthenticationConverter,
    ): SecurityFilterChain = httpSecurity
        .securityMatcher("/v2/**")
        .authorizeHttpRequests { auth ->
            auth.requestMatchers(HttpMethod.GET, "/v2/groups/*").permitAll()
            auth.anyRequest().authenticated()
        }
        .keycloakResourceServer(keycloakAuthenticationConverter)
        .build()
}
