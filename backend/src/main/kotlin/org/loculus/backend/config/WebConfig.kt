package org.loculus.backend.config

import org.loculus.backend.auth.UserConverter
import org.loculus.backend.log.OrganismMdcInterceptor
import org.springframework.context.annotation.Configuration
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.servlet.config.annotation.AsyncSupportConfigurer
import org.springframework.web.servlet.config.annotation.CorsRegistry
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

@Configuration
class WebConfig(private val backendConfig: BackendConfig) : WebMvcConfigurer {
    private val releasedDataSpoolCleanup = ReleasedDataSpoolCleanupInterceptor()

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
        registry.addInterceptor(releasedDataSpoolCleanup)
    }

    override fun configureAsyncSupport(configurer: AsyncSupportConfigurer) {
        configurer.registerCallableInterceptors(releasedDataSpoolCleanup)
    }

    override fun addArgumentResolvers(resolvers: MutableList<HandlerMethodArgumentResolver>) {
        resolvers.add(UserConverter())
    }
}
