package org.loculus.backend.auth

import io.swagger.v3.oas.annotations.media.Schema
import org.loculus.backend.auth.Roles.SUPER_USER
import org.springframework.core.MethodParameter
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
    const val GET_RELEASED_DATA = "get_released_data"
    const val EXTERNAL_METADATA_UPDATER = "external_metadata_updater"
}

class AuthenticatedUser(private val source: JwtAuthenticationToken) {
    val username: String
        get() = source.token.claims[StandardClaimNames.PREFERRED_USERNAME] as String

    val isSuperUser: Boolean
        get() = source.authorities.any { it.authority == SUPER_USER }
}

@Component
class UserConverter : HandlerMethodArgumentResolver {
    override fun supportsParameter(parameter: MethodParameter): Boolean =
        AuthenticatedUser::class.java.isAssignableFrom(parameter.parameterType)

    override fun resolveArgument(
        parameter: MethodParameter,
        mavContainer: ModelAndViewContainer?,
        webRequest: NativeWebRequest,
        binderFactory: WebDataBinderFactory?,
    ): Any? {
        val authentication = SecurityContextHolder.getContext().authentication
        if (authentication is JwtAuthenticationToken) {
            return AuthenticatedUser(authentication)
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
