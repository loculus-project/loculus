package org.loculus.backend.auth

import io.swagger.v3.oas.annotations.media.Schema
import org.loculus.backend.auth.Roles.PREPROCESSING_PIPELINE
import org.loculus.backend.auth.Roles.SUPER_USER
import org.springframework.core.MethodParameter
import org.springframework.security.authentication.AnonymousAuthenticationToken
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.core.oidc.StandardClaimNames
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.web.bind.support.WebDataBinderFactory
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.method.support.ModelAndViewContainer

object Roles {
    const val SUPER_USER = "super_user"
    const val PREPROCESSING_PIPELINE = "preprocessing_pipeline"
    const val EXTERNAL_METADATA_UPDATER = "external_metadata_updater"
}

open class User

class AuthenticatedUser private constructor(
    val username: String,
    val authorities: Collection<String>,
) : User() {
    companion object {
        fun fromJwt(jwt: JwtAuthenticationToken): AuthenticatedUser = AuthenticatedUser(
            username = jwt.token.claims[StandardClaimNames.PREFERRED_USERNAME] as String,
            authorities = jwt.authorities.map { it.authority },
        )

        fun fromServiceToken(token: ServiceTokenAuthentication): AuthenticatedUser = AuthenticatedUser(
            username = token.principal,
            authorities = token.authorities.map { it.authority },
        )
    }

    val isSuperUser: Boolean
        get() = authorities.any { it == SUPER_USER }

    val isPreprocessingPipeline: Boolean
        get() = authorities.any { it == PREPROCESSING_PIPELINE }
}

class AnonymousUser : User()

@Component
class UserConverter : HandlerMethodArgumentResolver {
    override fun supportsParameter(parameter: MethodParameter): Boolean =
        User::class.java.isAssignableFrom(parameter.parameterType)

    override fun resolveArgument(
        parameter: MethodParameter,
        mavContainer: ModelAndViewContainer?,
        webRequest: NativeWebRequest,
        binderFactory: WebDataBinderFactory?,
    ): Any? {
        val authentication = SecurityContextHolder.getContext().authentication
        if (authentication is JwtAuthenticationToken) {
            return AuthenticatedUser.fromJwt(authentication)
        }
        if (authentication is ServiceTokenAuthentication) {
            return AuthenticatedUser.fromServiceToken(authentication)
        }
        if (authentication is AnonymousAuthenticationToken) {
            return AnonymousUser()
        }
        throw IllegalArgumentException("Authentication object not of type AbstractAuthenticationToken")
    }
}

/**
 * Hides a parameter from the generated OpenAPI documentation.
 * Usage:
 *
 * ```kotlin
 * @RestController
 * class MyController {
 *     @GetMapping("/my-endpoint")
 *     fun myFunction(@HiddenParam authenticatedUser: AuthenticatedUser) {
 *         // ...
 *     }
 * }
 */
@Target(AnnotationTarget.VALUE_PARAMETER)
@Retention(AnnotationRetention.RUNTIME)
@Schema(hidden = true)
annotation class HiddenParam
