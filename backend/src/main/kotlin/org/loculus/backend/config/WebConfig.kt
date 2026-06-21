package org.loculus.backend.config

import org.loculus.backend.auth.UserConverter
import org.loculus.backend.log.OrganismMdcInterceptor
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.CorsConfigurationSource
import org.springframework.web.cors.UrlBasedCorsConfigurationSource
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.servlet.config.annotation.CorsRegistry
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

@Configuration
class WebConfig(private val backendConfig: BackendConfig) : WebMvcConfigurer {
    @Bean
    fun corsConfigurationSource(): CorsConfigurationSource {
        val websiteConfig = CorsConfiguration()
        websiteConfig.allowedOrigins = listOf(backendConfig.websiteUrl)
        websiteConfig.allowedMethods = listOf("GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD")
        websiteConfig.allowedHeaders = listOf("*")
        websiteConfig.maxAge = 3600L

        // /query/** is public (no auth); allow any origin so the dev server and
        // external clients can call the LAPIS proxy directly from the browser.
        val queryConfig = CorsConfiguration()
        queryConfig.allowedOriginPatterns = listOf("*")
        queryConfig.allowedMethods = listOf("GET", "POST", "OPTIONS")
        queryConfig.allowedHeaders = listOf("*")
        queryConfig.maxAge = 3600L

        val source = UrlBasedCorsConfigurationSource()
        source.registerCorsConfiguration("/**", websiteConfig)
        source.registerCorsConfiguration("/query/**", queryConfig)
        return source
    }

    override fun addCorsMappings(registry: CorsRegistry) {
        registry.addMapping("/**")
            .allowedOrigins(backendConfig.websiteUrl)
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD")
            .allowedHeaders("*")
            .maxAge(3600)
    }

    override fun addInterceptors(registry: InterceptorRegistry) {
        registry.addInterceptor(ReadOnlyModeInterceptor(backendConfig))
        registry.addInterceptor(OrganismMdcInterceptor())
    }

    override fun addArgumentResolvers(resolvers: MutableList<HandlerMethodArgumentResolver>) {
        resolvers.add(UserConverter())
    }
}
