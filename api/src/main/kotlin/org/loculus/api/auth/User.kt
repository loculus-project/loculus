package org.loculus.api.auth

import io.swagger.v3.oas.annotations.media.Schema
import mu.KotlinLogging
import org.springframework.core.MethodParameter
import org.springframework.security.authentication.AnonymousAuthenticationToken
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.core.oidc.StandardClaimNames
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.support.WebDataBinderFactory
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.method.support.ModelAndViewContainer

private val log = KotlinLogging.logger { }

object Roles {
    const val SUPER_USER = "super_user"
}

sealed interface User

class AuthenticatedUser(private val source: JwtAuthenticationToken) : User {
    val username: String
        get() = source.token.claims[StandardClaimNames.PREFERRED_USERNAME] as String

    val isSuperUser: Boolean
        get() = source.authorities.any { it.authority == Roles.SUPER_USER }
}

data object AnonymousUser : User

/**
 * Resolves controller parameters of type [User] (or [AuthenticatedUser]) from the security context.
 */
class UserArgumentResolver : HandlerMethodArgumentResolver {
    override fun supportsParameter(parameter: MethodParameter): Boolean =
        User::class.java.isAssignableFrom(parameter.parameterType)

    override fun resolveArgument(
        parameter: MethodParameter,
        mavContainer: ModelAndViewContainer?,
        webRequest: NativeWebRequest,
        binderFactory: WebDataBinderFactory?,
    ): Any = when (val authentication = SecurityContextHolder.getContext().authentication) {
        is JwtAuthenticationToken -> AuthenticatedUser(authentication)
        is AnonymousAuthenticationToken -> AnonymousUser
        else -> throw IllegalArgumentException("Unexpected authentication type: ${authentication?.javaClass}")
    }
}

/**
 * Hides a parameter from the generated OpenAPI documentation.
 */
@Target(AnnotationTarget.VALUE_PARAMETER)
@Retention(AnnotationRetention.RUNTIME)
@Schema(hidden = true)
annotation class HiddenParam

fun getRoles(jwt: Jwt): List<String> {
    val realmAccess = jwt.claims["realm_access"]
    if (realmAccess !is Map<*, *>) {
        if (realmAccess != null) {
            log.debug { "Ignoring value of realm_access in jwt because type was not Map<*,*>" }
        }
        return emptyList()
    }

    val roles = realmAccess["roles"]
    if (roles !is List<*>) {
        if (roles != null) {
            log.debug { "Ignoring value of roles in jwt because type was not List<*>" }
        }
        return emptyList()
    }
    return roles.filterIsInstance<String>()
}
