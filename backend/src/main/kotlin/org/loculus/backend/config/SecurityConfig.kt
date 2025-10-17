package org.loculus.backend.config

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import mu.KotlinLogging
import org.loculus.backend.auth.Roles.EXTERNAL_METADATA_UPDATER
import org.loculus.backend.auth.Roles.PREPROCESSING_PIPELINE
import org.loculus.backend.auth.Roles.SUPER_USER
import org.springframework.beans.factory.InitializingBean
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.convert.converter.Converter
import org.springframework.http.HttpMethod
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.core.AuthenticationException
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.core.oidc.StandardClaimNames
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint
import org.springframework.security.oauth2.server.resource.web.access.BearerTokenAccessDeniedHandler
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.access.AccessDeniedHandler
import org.springframework.security.web.access.AccessDeniedHandlerImpl
import org.springframework.security.web.access.DelegatingAccessDeniedHandler
import org.springframework.security.web.csrf.CsrfException
import org.springframework.stereotype.Component

private val log = KotlinLogging.logger { }

@Configuration
@EnableWebSecurity
class SecurityConfig {

    // This is the preconfigured default that we want to wrap in a logger
    private val defaultAccessDeniedHandler = DelegatingAccessDeniedHandler(
        linkedMapOf(CsrfException::class.java to AccessDeniedHandlerImpl()),
        BearerTokenAccessDeniedHandler(),
    )

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
        "/get-seqset-cited-by-publication",
        "/get-author",
        "/*/get-released-data",
        "/files/get/**",
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

@Component
class KeycloakAuthenticationConverter(val authoritiesConverter: KeycloakAuthoritiesConverter) :
    Converter<Jwt, JwtAuthenticationToken> {
    override fun convert(jwt: Jwt): JwtAuthenticationToken = JwtAuthenticationToken(
        jwt,
        authoritiesConverter.convert(jwt),
        jwt.getClaimAsString(StandardClaimNames.PREFERRED_USERNAME),
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

@Component
class AuthUrlIsPresentGuard(@Value("\${$AUTH_URL_PROPERTY:#{null}}") private val authUrlProperty: String?) :
    InitializingBean {

    override fun afterPropertiesSet() {
        if (authUrlProperty == null) {
            throw IllegalStateException(
                "Missing required property '$AUTH_URL_PROPERTY'. Please set it when starting the application.",
            )
        }
    }
}
