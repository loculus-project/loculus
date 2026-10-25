package org.loculus.backend.api.v1

import org.loculus.backend.auth.KeycloakAuthenticationConverter
import org.loculus.backend.auth.LoggingAccessDeniedHandler
import org.loculus.backend.auth.LoggingAuthenticationEntryPoint
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint
import org.springframework.security.oauth2.server.resource.web.access.BearerTokenAccessDeniedHandler
import org.springframework.security.web.SecurityFilterChain

@Configuration
class V1SecurityConfig {

    private val getEndpointsThatArePublic = arrayOf(
        "/v1/groups/*",
    )

    // Runs before the v0 chain, which handles every other path
    @Bean
    @Order(1)
    fun v1SecurityFilterChain(
        httpSecurity: HttpSecurity,
        keycloakAuthenticationConverter: KeycloakAuthenticationConverter,
    ): SecurityFilterChain = httpSecurity
        .securityMatcher("/v1/**")
        .authorizeHttpRequests { auth ->
            auth.requestMatchers(HttpMethod.GET, *getEndpointsThatArePublic).permitAll()
            auth.requestMatchers(HttpMethod.OPTIONS).permitAll()
            auth.anyRequest().authenticated()
        }
        .csrf { csrf -> csrf.disable() }
        .oauth2ResourceServer { oauth2 ->
            oauth2.jwt { jwt ->
                jwt.jwtAuthenticationConverter(keycloakAuthenticationConverter)
            }
                .authenticationEntryPoint(
                    LoggingAuthenticationEntryPoint(BearerTokenAuthenticationEntryPoint()),
                )
                .accessDeniedHandler(LoggingAccessDeniedHandler(BearerTokenAccessDeniedHandler()))
        }
        .build()
}
