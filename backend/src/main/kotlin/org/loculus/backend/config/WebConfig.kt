package org.loculus.backend.config

import org.loculus.backend.auth.UserConverter
import org.loculus.backend.log.OrganismMdcInterceptor
import org.springframework.context.annotation.Configuration
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.servlet.config.annotation.CorsRegistry
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

@Configuration
class WebConfig(private val backendConfig: BackendConfig) : WebMvcConfigurer {
    override fun addCorsMappings(registry: CorsRegistry) {
        registry.addMapping("/**")
            .allowedOrigins("*") // Allow requests from any origin
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD")
            .allowedHeaders("*")
            .maxAge(3600) // Max age of pre-flight requests
    }

    override fun addInterceptors(registry: InterceptorRegistry) {
        registry.addInterceptor(ReadOnlyModeInterceptor(backendConfig))
        registry.addInterceptor(OrganismMdcInterceptor())
    }

    override fun addArgumentResolvers(resolvers: MutableList<HandlerMethodArgumentResolver>) {
        resolvers.add(UserConverter())
    }

    // The default API docs combine all versions, so serve the v0 docs there instead
    override fun addViewControllers(registry: ViewControllerRegistry) {
        registry.addViewController("/api-docs").setViewName("forward:/api-docs/v0")
        registry.addViewController("/api-docs.yaml").setViewName("forward:/api-docs.yaml/v0")
    }
}
