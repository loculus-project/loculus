package org.loculus.backend.config

import org.loculus.backend.auth.UserConverter
import org.loculus.backend.log.OrganismMdcInterceptor
import org.springframework.context.annotation.Configuration
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.servlet.config.annotation.CorsRegistry
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

@Configuration
class WebConfig(private val backendConfig: BackendConfig) : WebMvcConfigurer {
    override fun addCorsMappings(registry: CorsRegistry) {
        registry.addMapping("/**")
            .allowedOrigins("*") // Allow requests from any origin
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD")
            .allowedHeaders("*")
            // the website's JavaScript reads the engine's validators: its POST cache revalidates with If-None-Match
            .exposedHeaders("ETag", "Lapis-Data-Version")
            .maxAge(3600) // Max age of pre-flight requests
    }

    override fun addInterceptors(registry: InterceptorRegistry) {
        // query engine (LAPIS-compatible) POSTs are reads
        registry.addInterceptor(ReadOnlyModeInterceptor(backendConfig)).excludePathPatterns("/*/sample/**")
        registry.addInterceptor(OrganismMdcInterceptor())
    }

    override fun addArgumentResolvers(resolvers: MutableList<HandlerMethodArgumentResolver>) {
        resolvers.add(UserConverter())
    }
}
