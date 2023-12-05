package org.pathoplexus.backend.config

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import mu.KotlinLogging
import org.springframework.beans.factory.InitializingBean
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.config.Customizer
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.core.AuthenticationException
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
    private val defaultAccessDeniedHandler =
        DelegatingAccessDeniedHandler(
            linkedMapOf(CsrfException::class.java to AccessDeniedHandlerImpl()),
            BearerTokenAccessDeniedHandler(),
        )

    private val temporarilyAuthDisabledEndpoints =
        arrayOf(
            "/*/extract-unprocessed-data",
            "/*/submit-processed-data",
            "/*/get-released-data",
        )

    @Bean
    fun securityFilterChain(httpSecurity: HttpSecurity): SecurityFilterChain {
        return httpSecurity
            .authorizeHttpRequests { a ->
                a.requestMatchers(
                    "/",
                    "favicon.ico",
                    "/error/**",
                    "/actuator/**",
                    "/api-docs**",
                    "/api-docs/**",
                    "/swagger-ui/**",
                ).permitAll()
                // TODO(#607): Remove when we have authentication for services
                a.requestMatchers(*temporarilyAuthDisabledEndpoints).permitAll()
                a.requestMatchers(HttpMethod.OPTIONS).permitAll()
                a.anyRequest().authenticated()
            }
            // TODO(#607): Remove when we have authentication for services
            .csrf { it.ignoringRequestMatchers(*temporarilyAuthDisabledEndpoints) }
            .oauth2ResourceServer { oauth2 ->
                oauth2.jwt(Customizer.withDefaults())
                    .authenticationEntryPoint(LoggingAuthenticationEntryPoint(BearerTokenAuthenticationEntryPoint()))
                    .accessDeniedHandler(LoggingAccessDeniedHandler(defaultAccessDeniedHandler))
            }
            .build()
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
class AuthUrlIsPresentGuard(
    @Value("\${$AUTH_URL_PROPERTY:#{null}}") private val authUrlProperty: String?,
) :
    InitializingBean {
    override fun afterPropertiesSet() {
        if (authUrlProperty == null) {
            throw IllegalStateException(
                "Missing required property '$AUTH_URL_PROPERTY'. Please set it when starting the application.",
            )
        }
    }
}
