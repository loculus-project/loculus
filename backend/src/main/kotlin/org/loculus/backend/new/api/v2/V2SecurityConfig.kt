package org.loculus.backend.new.api.v2

import org.loculus.backend.config.KeycloakAuthenticationConverter
import org.loculus.backend.config.LoggingAccessDeniedHandler
import org.loculus.backend.config.LoggingAuthenticationEntryPoint
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint
import org.springframework.security.oauth2.server.resource.web.access.BearerTokenAccessDeniedHandler
import org.springframework.security.web.SecurityFilterChain

@Configuration
class V2SecurityConfig {

    private val getEndpointsThatArePublic = arrayOf(
        "/v2/groups/*",
    )

    // Runs before the v1 chain, which handles every other path
    @Bean
    @Order(1)
    fun v2SecurityFilterChain(
        httpSecurity: HttpSecurity,
        keycloakAuthenticationConverter: KeycloakAuthenticationConverter,
    ): SecurityFilterChain = httpSecurity
        .securityMatcher("/v2/**")
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
