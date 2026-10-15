package org.loculus.backend.v2.auth

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.loculus.backend.controller.UnauthorizedException
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.method.HandlerMethod
import org.springframework.web.servlet.HandlerInterceptor
import kotlin.reflect.KClass

/** Anyone may call the endpoint, with or without a token. */
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class Public

/** Any user with a valid token may call the endpoint. */
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class Authenticated

/**
 * Every v2 endpoint declares who may call it with one of these annotations, so access is visible on the endpoint
 * itself and documented in the OpenAPI spec (as `x-access`). Data-dependent checks such as group membership stay in
 * the services.
 */
enum class Access(val annotation: KClass<out Annotation>) {
    PUBLIC(Public::class),
    AUTHENTICATED(Authenticated::class),
}

fun HandlerMethod.access(): Access? {
    val declared = Access.entries.filter { hasMethodAnnotation(it.annotation.java) }
    check(declared.size <= 1) { "$shortLogMessage declares more than one access level: $declared" }
    return declared.singleOrNull()
}

/**
 * Enforces the [Access] of every v2 endpoint. The v2 security filter chain only validates bearer tokens.
 * An endpoint that does not declare its access is never served.
 */
class AccessInterceptor : HandlerInterceptor {
    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        if (handler !is HandlerMethod) {
            return true
        }
        val access = checkNotNull(handler.access()) {
            "${handler.shortLogMessage} does not declare who may call it (@Public or @Authenticated)"
        }
        val isAuthenticated = SecurityContextHolder.getContext().authentication is JwtAuthenticationToken
        if (access == Access.AUTHENTICATED && !isAuthenticated) {
            throw UnauthorizedException("Authentication required.")
        }
        return true
    }
}
