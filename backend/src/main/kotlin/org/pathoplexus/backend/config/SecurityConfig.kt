package org.pathoplexus.backend.config

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import mu.KotlinLogging
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

    private val temporarilyAuthDisabledEndpoints = arrayOf(
        "/*/get-released-data",
    )

    private val endpointsForPreprocessingPipeline = arrayOf(
        "/*/extract-unprocessed-data",
        "/*/submit-processed-data",
    )

    @Bean
    fun securityFilterChain(
        httpSecurity: HttpSecurity,
        keycloakAuthoritiesConverter: KeycloakAuthenticationConverter,
    ): SecurityFilterChain {
        return httpSecurity
            .authorizeHttpRequests { auth ->
                auth.requestMatchers(
                    "/",
                    "favicon.ico",
                    "/error/**",
                    "/actuator/**",
                    "/api-docs**",
                    "/api-docs/**",
                    "/swagger-ui/**",
                ).permitAll()
                // TODO(#607): Remove when we have authentication for services
                auth.requestMatchers(*temporarilyAuthDisabledEndpoints).permitAll()
                auth.requestMatchers(HttpMethod.OPTIONS).permitAll()
                auth.requestMatchers(*endpointsForPreprocessingPipeline).hasAuthority("preprocessing_pipeline")
                auth.anyRequest().authenticated()
            }
            // TODO(#607): Remove when we have authentication for services
            .csrf { it.ignoringRequestMatchers(*temporarilyAuthDisabledEndpoints) }
            .oauth2ResourceServer { oauth2 ->
                oauth2.jwt { jwt ->
                    jwt.jwtAuthenticationConverter(keycloakAuthoritiesConverter)
                }
                    .authenticationEntryPoint(LoggingAuthenticationEntryPoint(BearerTokenAuthenticationEntryPoint()))
                    .accessDeniedHandler(LoggingAccessDeniedHandler(defaultAccessDeniedHandler))
            }
            .build()
    }
}

@Component
class KeycloakAuthoritiesConverter :
    Converter<Jwt, List<SimpleGrantedAuthority>> {
    override fun convert(jwt: Jwt): List<SimpleGrantedAuthority> {
        val defaultRealmAccess = mapOf<String, List<String>>()
        val realmAccess = jwt.claims.getOrDefault("realm_access", defaultRealmAccess) as Map<String, List<String>>
        val roles = realmAccess.getOrDefault("roles", listOf())
        return roles.stream().map { role: String? ->
            SimpleGrantedAuthority(
                role,
            )
        }.toList()
    }
}

@Component
class KeycloakAuthenticationConverter(
    val authoritiesConverter: KeycloakAuthoritiesConverter,
) :
    Converter<Jwt, JwtAuthenticationToken> {
    override fun convert(jwt: Jwt): JwtAuthenticationToken {
        return JwtAuthenticationToken(
            jwt,
            authoritiesConverter.convert(jwt),
            jwt.getClaimAsString(StandardClaimNames.PREFERRED_USERNAME),
        )
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
