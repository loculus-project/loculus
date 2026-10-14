package org.loculus.api.common.config

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.loculus.api.common.auth.AccessInterceptor
import org.loculus.api.common.auth.UserArgumentResolver
import org.loculus.api.common.error.ServiceUnavailableException
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Configuration
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.servlet.HandlerInterceptor
import org.springframework.web.servlet.config.annotation.CorsRegistry
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

@Configuration
class WebConfig(@Value("\${loculus.read-only-mode}") private val readOnlyMode: Boolean) : WebMvcConfigurer {
    override fun addCorsMappings(registry: CorsRegistry) {
        registry.addMapping("/**")
            .allowedOrigins("*")
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD")
            .allowedHeaders("*")
            .maxAge(3600)
    }

    override fun addInterceptors(registry: InterceptorRegistry) {
        registry.addInterceptor(AccessInterceptor()).addPathPatterns("/v2/**")
        registry.addInterceptor(ReadOnlyModeInterceptor(readOnlyMode))
    }

    override fun addArgumentResolvers(resolvers: MutableList<HandlerMethodArgumentResolver>) {
        resolvers.add(UserArgumentResolver())
    }
}

class ReadOnlyModeInterceptor(private val readOnlyMode: Boolean) : HandlerInterceptor {
    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        if (readOnlyMode && request.method in WRITE_METHODS) {
            throw ServiceUnavailableException(
                "This Loculus instance is in read-only mode; write requests are disabled.",
            )
        }
        return true
    }

    companion object {
        private val WRITE_METHODS = setOf("POST", "PUT", "DELETE", "PATCH")
    }
}
