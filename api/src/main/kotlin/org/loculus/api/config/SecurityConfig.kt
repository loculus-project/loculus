package org.loculus.api.config

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import mu.KotlinLogging
import org.loculus.api.auth.getRoles
import org.springframework.beans.factory.InitializingBean
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.convert.converter.Converter
import org.springframework.http.HttpMethod
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.core.AuthenticationException
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.core.oidc.StandardClaimNames
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint
import org.springframework.security.oauth2.server.resource.web.access.BearerTokenAccessDeniedHandler
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.access.AccessDeniedHandler
import org.springframework.stereotype.Component

private val log = KotlinLogging.logger { }

@Configuration
@EnableWebSecurity
class SecurityConfig {

    private val publicGetEndpoints = arrayOf(
        "/v2/groups/*",
    )

    @Bean
    fun securityFilterChain(
        httpSecurity: HttpSecurity,
        keycloakAuthenticationConverter: KeycloakAuthenticationConverter,
    ): SecurityFilterChain = httpSecurity
        // Stateless bearer-token API without cookies: CSRF does not apply, and it would turn missing-token 401s into 403s
        .csrf { it.disable() }
        .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
        .authorizeHttpRequests { auth ->
            auth.requestMatchers(
                "/error/**",
                "/actuator/health/**",
                "/api-docs",
                "/api-docs/**",
                "/swagger-ui/**",
                "/swagger-ui.html",
            ).permitAll()
            auth.requestMatchers(HttpMethod.GET, *publicGetEndpoints).permitAll()
            auth.requestMatchers(HttpMethod.OPTIONS).permitAll()
            auth.anyRequest().authenticated()
        }
        .oauth2ResourceServer { oauth2 ->
            oauth2.jwt { jwt -> jwt.jwtAuthenticationConverter(keycloakAuthenticationConverter) }
                .authenticationEntryPoint(LoggingAuthenticationEntryPoint(BearerTokenAuthenticationEntryPoint()))
                .accessDeniedHandler(LoggingAccessDeniedHandler(BearerTokenAccessDeniedHandler()))
        }
        .build()
}

@Component
class KeycloakAuthenticationConverter : Converter<Jwt, JwtAuthenticationToken> {
    override fun convert(jwt: Jwt): JwtAuthenticationToken = JwtAuthenticationToken(
        jwt,
        getRoles(jwt).map { SimpleGrantedAuthority(it) },
        // Must be an AuthenticationException to get a 401; anything else escapes the filter chain as a 500.
        jwt.getClaimAsString(StandardClaimNames.PREFERRED_USERNAME)
            ?: throw InvalidBearerTokenException("Token is missing the 'preferred_username' claim"),
    )
}

class LoggingAuthenticationEntryPoint(private val entryPoint: AuthenticationEntryPoint) :
    AuthenticationEntryPoint by entryPoint {

    override fun commence(
        request: HttpServletRequest,
        response: HttpServletResponse,
        authException: AuthenticationException,
    ) {
        log.warn { "${request.method} ${request.requestURI}: $authException" }
        entryPoint.commence(request, response, authException)
    }
}

class LoggingAccessDeniedHandler(private val accessDeniedHandler: AccessDeniedHandler) :
    AccessDeniedHandler by accessDeniedHandler {

    override fun handle(
        request: HttpServletRequest,
        response: HttpServletResponse,
        accessDeniedException: AccessDeniedException,
    ) {
        log.warn { "${request.method} ${request.requestURI}: $accessDeniedException" }
        accessDeniedHandler.handle(request, response, accessDeniedException)
    }
}

private const val AUTH_URL_PROPERTY = "spring.security.oauth2.resourceserver.jwt.jwk-set-uri"

@Component
class AuthUrlIsPresentGuard(@Value("\${$AUTH_URL_PROPERTY:#{null}}") private val authUrlProperty: String?) :
    InitializingBean {

    override fun afterPropertiesSet() {
        checkNotNull(authUrlProperty) {
            "Missing required property '$AUTH_URL_PROPERTY'. Please set it when starting the application."
        }
    }
}
