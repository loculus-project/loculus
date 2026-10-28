package org.loculus.backend.config

import org.loculus.backend.api.v0.v0AccessRules
import org.loculus.backend.auth.KeycloakAuthenticationConverter
import org.loculus.backend.auth.LoggingAccessDeniedHandler
import org.loculus.backend.auth.LoggingAuthenticationEntryPoint
import org.loculus.backend.auth.Roles.SUPER_USER
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint
import org.springframework.security.oauth2.server.resource.web.access.BearerTokenAccessDeniedHandler
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.access.AccessDeniedHandlerImpl
import org.springframework.security.web.access.DelegatingAccessDeniedHandler
import org.springframework.security.web.csrf.CsrfException

@Configuration
@EnableWebSecurity
class SecurityConfig {

    // This is the preconfigured default that we want to wrap in a logger
    private val defaultAccessDeniedHandler = DelegatingAccessDeniedHandler(
        linkedMapOf(CsrfException::class.java to AccessDeniedHandlerImpl()),
        BearerTokenAccessDeniedHandler(),
    )

    private val debugEndpoints = arrayOf(
        "/debug/*",
    )

    @Bean
    fun securityFilterChain(
        httpSecurity: HttpSecurity,
        keycloakAuthoritiesConverter: KeycloakAuthenticationConverter,
    ): SecurityFilterChain = httpSecurity
        .authorizeHttpRequests { auth ->
            auth.requestMatchers(
                "/",
                "/favicon.ico",
                "/error/**",
                "/actuator/**",
                "/api-docs**",
                "/api-docs/**",
                "/swagger-ui/**",
            ).permitAll()
            auth.requestMatchers(HttpMethod.OPTIONS).permitAll()
            v0AccessRules(auth)
            auth.requestMatchers(*debugEndpoints).hasAuthority(SUPER_USER)
            auth.anyRequest().authenticated()
        }
        .oauth2ResourceServer { oauth2 ->
            oauth2.jwt { jwt ->
                jwt.jwtAuthenticationConverter(keycloakAuthoritiesConverter)
            }
                .authenticationEntryPoint(
                    LoggingAuthenticationEntryPoint(BearerTokenAuthenticationEntryPoint()),
                )
                .accessDeniedHandler(LoggingAccessDeniedHandler(defaultAccessDeniedHandler))
        }
        .build()
}
