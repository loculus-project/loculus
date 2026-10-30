package org.loculus.backend.auth

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import mu.KotlinLogging
import org.springframework.beans.factory.InitializingBean
import org.springframework.beans.factory.annotation.Value
import org.springframework.core.convert.converter.Converter
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.core.AuthenticationException
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.core.oidc.StandardClaimNames
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.access.AccessDeniedHandler
import org.springframework.stereotype.Component

private val log = KotlinLogging.logger { }

@Component
class KeycloakAuthenticationConverter(val authoritiesConverter: KeycloakAuthoritiesConverter) :
    Converter<Jwt, JwtAuthenticationToken> {
    override fun convert(jwt: Jwt): JwtAuthenticationToken = JwtAuthenticationToken(
        jwt,
        authoritiesConverter.convert(jwt),
        // Must be an AuthenticationException to get a 401; anything else escapes the filter chain as a 500.
        jwt.getClaimAsString(StandardClaimNames.PREFERRED_USERNAME)
            ?: throw InvalidBearerTokenException("Token is missing the 'preferred_username' claim"),
    )
}

@Component
class KeycloakAuthoritiesConverter : Converter<Jwt, List<SimpleGrantedAuthority>> {
    override fun convert(jwt: Jwt): List<SimpleGrantedAuthority> {
        val roles = getRoles(jwt)
        return roles.map { role: String -> SimpleGrantedAuthority(role) }
    }
}

fun getRoles(jwt: Jwt): List<String> {
    val defaultRealmAccess = mapOf<String, List<String>>()
    val realmAccess = when (jwt.claims["realm_access"]) {
        null -> defaultRealmAccess

        is Map<*, *> -> jwt.claims["realm_access"] as Map<*, *>

        else -> {
            log.debug { "Ignoring value of realm_access in jwt because type was not Map<*,*>" }
            defaultRealmAccess
        }
    }

    return when (realmAccess["roles"]) {
        null -> emptyList()

        is List<*> -> (realmAccess["roles"] as List<*>).filterIsInstance<String>()

        else -> {
            log.debug { "Ignoring value of roles in jwt because type was not List<*>" }
            emptyList()
        }
    }
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
private const val AUTH_ISSUER_PROPERTY = "spring.security.oauth2.resourceserver.jwt.issuer-uri"

@Component
class JwtConfigIsPresentGuard(
    @Value("\${$AUTH_URL_PROPERTY:#{null}}") private val jwkSetUri: String?,
    @Value("\${$AUTH_ISSUER_PROPERTY:#{null}}") private val issuerUri: String?,
) : InitializingBean {

    override fun afterPropertiesSet() {
        if (jwkSetUri.isNullOrBlank()) {
            throw IllegalStateException(
                "Missing required property '$AUTH_URL_PROPERTY'. Please set it when starting the application.",
            )
        }
        // Spring Boot uses issuer-uri to validate iss even when signing keys come from an internal JWKS URL.
        if (issuerUri.isNullOrBlank()) {
            throw IllegalStateException(
                "Missing required property '$AUTH_ISSUER_PROPERTY'. Please set it to the trusted token issuer.",
            )
        }
    }
}
