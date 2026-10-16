package org.loculus.backend.config

import org.loculus.backend.auth.Roles.EXTERNAL_METADATA_UPDATER
import org.loculus.backend.auth.Roles.PREPROCESSING_PIPELINE
import org.loculus.backend.auth.Roles.SUPER_USER
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.web.SecurityFilterChain

@Configuration
@EnableWebSecurity
class SecurityConfig {

    private val endpointsForPreprocessingPipeline = arrayOf(
        "/*/extract-unprocessed-data",
        "/*/submit-processed-data",
    )

    private val endpointsForExternalMetadataUpdater = arrayOf(
        "/*/submit-external-metadata",
    )

    private val getEndpointsThatArePublic = arrayOf(
        "/data-use-terms/*",
        "/get-seqset",
        "/get-seqset-records",
        "/get-seqset-citations",
        "/get-sequence-citations",
        "/get-author",
        "/*/get-released-data",
        "/files/get/**",
        "/groups/*",
    )

    private val headEndpointsThatArePublic = arrayOf(
        "/files/get/**",
    )

    private val debugEndpoints = arrayOf(
        "/debug/*",
    )

    private val adminEndpoints = arrayOf(
        "/admin/*",
    )

    // Matches every request, so it must be the last filter chain (v2 registers its own chain for /v2/**)
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
            auth.requestMatchers(HttpMethod.GET, *getEndpointsThatArePublic).permitAll()
            auth.requestMatchers(HttpMethod.HEAD, *headEndpointsThatArePublic).permitAll()
            auth.requestMatchers(HttpMethod.OPTIONS).permitAll()
            auth.requestMatchers(*endpointsForPreprocessingPipeline).hasAuthority(PREPROCESSING_PIPELINE)
            auth.requestMatchers(
                *endpointsForExternalMetadataUpdater,
            ).hasAuthority(EXTERNAL_METADATA_UPDATER)
            auth.requestMatchers(*adminEndpoints).hasAuthority(SUPER_USER)
            auth.requestMatchers(*debugEndpoints).hasAuthority(SUPER_USER)
            auth.anyRequest().authenticated()
        }
        .keycloakResourceServer(keycloakAuthoritiesConverter)
        .build()
}
