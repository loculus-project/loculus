package org.loculus.backend.query.cache

import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.loculus.backend.query.index.OrganismIndexProvider
import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
@EnableConfigurationProperties(ResponseCacheProperties::class)
class ResponseCacheConfiguration {
    @Bean(destroyMethod = "close")
    @ConditionalOnProperty(prefix = "loculus.query-engine", name = ["enabled"], havingValue = "true")
    fun responseCache(
        properties: ResponseCacheProperties,
        meters: ObjectProvider<MeterRegistry>,
        indexProvider: OrganismIndexProvider,
    ) = ResponseCache(
        properties,
        meters.getIfAvailable { SimpleMeterRegistry() },
        tokenSource = { organism -> indexProvider.get(organism)?.contentToken },
    )
}
