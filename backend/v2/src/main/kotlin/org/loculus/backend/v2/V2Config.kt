package org.loculus.backend.v2

import org.loculus.backend.config.KeycloakAuthenticationConverter
import org.loculus.backend.config.LoggingAuthenticationEntryPoint
import org.springdoc.core.customizers.OperationCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint
import org.springframework.security.web.SecurityFilterChain
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

const val V2_PATHS = "/v2/**"

@Configuration
class V2Config : WebMvcConfigurer {

    /**
     * Takes precedence over v1's catch-all filter chain. It only validates bearer tokens (an invalid token is always
     * a 401); whether a request may reach an endpoint is decided by the [AccessInterceptor].
     */
    @Bean
    @Order(1)
    fun v2SecurityFilterChain(
        httpSecurity: HttpSecurity,
        keycloakAuthenticationConverter: KeycloakAuthenticationConverter,
    ): SecurityFilterChain = httpSecurity
        .securityMatcher(V2_PATHS)
        // Stateless bearer-token API without cookies: CSRF does not apply, and it would turn missing-token 401s into 403s
        .csrf { it.disable() }
        .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
        .authorizeHttpRequests { it.anyRequest().permitAll() }
        .oauth2ResourceServer { oauth2 ->
            oauth2.jwt { it.jwtAuthenticationConverter(keycloakAuthenticationConverter) }
                .authenticationEntryPoint(LoggingAuthenticationEntryPoint(BearerTokenAuthenticationEntryPoint()))
        }
        .build()

    override fun addInterceptors(registry: InterceptorRegistry) {
        registry.addInterceptor(AccessInterceptor()).addPathPatterns(V2_PATHS)
    }

    @Bean
    fun accessOperationCustomizer() = OperationCustomizer { operation, handlerMethod ->
        handlerMethod.access()?.let { access ->
            operation.addExtension("x-access", access.name.lowercase())
            if (access == Access.PUBLIC) {
                operation.security = emptyList()
            }
        }
        operation
    }
}
