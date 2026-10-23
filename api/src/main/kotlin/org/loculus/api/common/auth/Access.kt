package org.loculus.api.common.auth

import io.swagger.v3.oas.models.Operation
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.loculus.api.common.error.ForbiddenException
import org.loculus.api.common.error.UnauthorizedException
import org.springdoc.core.customizers.OperationCustomizer
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.method.HandlerMethod
import org.springframework.web.servlet.HandlerInterceptor

/**
 * Who may call an endpoint is declared on the controller method itself:
 *
 * - [Public]: anyone, with or without a token
 * - [RequiresRole]: authenticated users with the given Keycloak realm role
 * - no annotation: any authenticated user
 *
 * Endpoints may still apply finer, data-dependent checks (e.g. group membership) in their service.
 */
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class Public

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class RequiresRole(val role: String)

sealed interface Access {
    data object Public : Access
    data object Authenticated : Access
    data class Role(val role: String) : Access
}

fun HandlerMethod.access(): Access {
    val isPublic = hasMethodAnnotation(Public::class.java)
    val requiredRole = getMethodAnnotation(RequiresRole::class.java)
    check(!(isPublic && requiredRole != null)) { "$this cannot be both @Public and @RequiresRole" }
    return when {
        isPublic -> Access.Public
        requiredRole != null -> Access.Role(requiredRole.role)
        else -> Access.Authenticated
    }
}

/**
 * Enforces [Access] for every controller method. The security filter chain only validates bearer tokens on these
 * routes (an invalid token is always a 401); this interceptor decides whether the caller may use the endpoint.
 */
class AccessInterceptor : HandlerInterceptor {
    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        if (handler !is HandlerMethod) {
            return true
        }
        val authentication = SecurityContextHolder.getContext().authentication as? JwtAuthenticationToken
        when (val access = handler.access()) {
            Access.Public -> Unit

            Access.Authenticated -> if (authentication == null) {
                throw UnauthorizedException("Authentication required.")
            }

            is Access.Role -> when {
                authentication == null -> throw UnauthorizedException("Authentication required.")

                authentication.authorities.none { it.authority == access.role } ->
                    throw ForbiddenException("Role '${access.role}' required.")
            }
        }
        return true
    }
}

const val ACCESS_EXTENSION = "x-access"

/**
 * Documents each endpoint's [Access] in the OpenAPI spec: an `x-access` extension, and no security requirement
 * for public endpoints.
 */
class AccessOperationCustomizer : OperationCustomizer {
    override fun customize(operation: Operation, handlerMethod: HandlerMethod): Operation {
        when (val access = handlerMethod.access()) {
            Access.Public -> {
                operation.security = emptyList()
                operation.addExtension(ACCESS_EXTENSION, "public")
            }

            Access.Authenticated -> operation.addExtension(ACCESS_EXTENSION, "authenticated")

            is Access.Role -> operation.addExtension(ACCESS_EXTENSION, "role:${access.role}")
        }
        return operation
    }
}
