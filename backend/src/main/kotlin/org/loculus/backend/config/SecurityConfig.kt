package org.loculus.backend.config

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import mu.KotlinLogging
import org.loculus.backend.auth.InstanceAccessPolicy
import org.loculus.backend.auth.InstanceActorAdapter
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
import org.springframework.security.authorization.AuthorizationDecision
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
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

    @Bean
    fun securityFilterChain(
        httpSecurity: HttpSecurity,
        keycloakAuthoritiesConverter: KeycloakAuthenticationConverter,
        instanceAccessPolicy: InstanceAccessPolicy,
        instanceActorAdapter: InstanceActorAdapter,
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
            auth.requestMatchers(HttpMethod.GET, "/access/capabilities").permitAll()
            auth.requestMatchers(HttpMethod.GET, *getEndpointsThatArePublic).access { authentication, _ ->
                AuthorizationDecision(
                    instanceAccessPolicy.canReadReleasedData(instanceActorAdapter.resolve(authentication.get())),
                )
            }
            auth.requestMatchers(HttpMethod.HEAD, *headEndpointsThatArePublic).access { authentication, _ ->
                AuthorizationDecision(
                    instanceAccessPolicy.canReadReleasedData(instanceActorAdapter.resolve(authentication.get())),
                )
            }
            auth.requestMatchers(HttpMethod.OPTIONS).permitAll()
            auth.requestMatchers(*endpointsForPreprocessingPipeline).hasAuthority(PREPROCESSING_PIPELINE)
            auth.requestMatchers(
                *endpointsForExternalMetadataUpdater,
            ).hasAuthority(EXTERNAL_METADATA_UPDATER)
            auth.requestMatchers(*adminEndpoints).hasAuthority(SUPER_USER)
            auth.requestMatchers(*debugEndpoints).hasAuthority(SUPER_USER)
            if (instanceAccessPolicy.restricted) {
                // Machine ingestion retains its existing group checks without a human Contributor role.
                auth.requestMatchers(HttpMethod.POST, "/groups").hasAnyAuthority(SUPER_USER, "ingestion_pipeline")
                auth.requestMatchers(
                    "/*/submit",
                    "/*/revise",
                    "/*/approve-processed-data",
                    "/*/revoke",
                    "/*/get-submitted-data",
                    "/*/get-submitted-metadata",
                    "/*/get-sequences",
                ).access { authentication, _ ->
                    val actor = authentication.get()
                    AuthorizationDecision(
                        instanceAccessPolicy.canContribute(instanceActorAdapter.resolve(actor)) ||
                            actor.authorities.any { it.authority == "ingestion_pipeline" },
                    )
                }
                // Operators provision groups/membership in the first restricted-mode implementation.
                auth.requestMatchers(HttpMethod.PUT, "/groups/*/users/*").hasAuthority(SUPER_USER)
                auth.requestMatchers(HttpMethod.DELETE, "/groups/*/users/*").hasAuthority(SUPER_USER)
                auth.requestMatchers(HttpMethod.GET, "/groups", "/user/groups", "/get-seqsets-of-user").authenticated()
                // Fail closed for new endpoints: viewers only get the explicitly listed released reads.
                auth.anyRequest().access { authentication, _ ->
                    AuthorizationDecision(
                        instanceAccessPolicy.canContribute(instanceActorAdapter.resolve(authentication.get())),
                    )
                }
            } else {
                auth.anyRequest().authenticated()
            }
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
