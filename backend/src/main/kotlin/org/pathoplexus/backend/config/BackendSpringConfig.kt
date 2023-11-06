package org.pathoplexus.backend.config

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.flywaydb.core.Flyway
import org.jetbrains.exposed.spring.autoconfigure.ExposedAutoConfiguration
import org.jetbrains.exposed.sql.DatabaseConfig
import org.jetbrains.exposed.sql.Slf4jSqlDebugLogger
import org.pathoplexus.backend.model.SchemaConfig
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.ImportAutoConfiguration
import org.springframework.boot.autoconfigure.jdbc.DataSourceTransactionManagerAutoConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.web.filter.CommonsRequestLoggingFilter
import java.io.File
import javax.sql.DataSource

object BackendSpringProperty {
    const val BACKEND_REFERENCE_GENOME_PATH = "backend.referenceGenome.path"
    const val BACKEND_CONFIG_PATH = "backend.config.path"
}

@Configuration
@ImportAutoConfiguration(
    value = [ExposedAutoConfiguration::class],
    exclude = [DataSourceTransactionManagerAutoConfiguration::class],
)
class BackendSpringConfig {

    @Bean
    fun logFilter(): CommonsRequestLoggingFilter {
        val filter = CommonsRequestLoggingFilter()
        filter.setIncludeQueryString(true)
        filter.setIncludePayload(true)
        filter.setMaxPayloadLength(10000)
        filter.setIncludeHeaders(false)
        filter.setAfterMessagePrefix("REQUEST DATA: ")
        return filter
    }

    @Bean
    fun databaseConfig() = DatabaseConfig {
        useNestedTransactions = true
        sqlLogger = Slf4jSqlDebugLogger
    }

    @Bean
    @Profile("!test")
    fun getFlyway(dataSource: DataSource): Flyway {
        val configuration = Flyway.configure()
            .baselineOnMigrate(true)
            .dataSource(dataSource)
            .validateMigrationNaming(true)
        val flyway = Flyway(configuration)
        flyway.migrate()
        return flyway
    }

    @Bean
    fun schemaConfig(
        objectMapper: ObjectMapper,
        @Value("\${${BackendSpringProperty.BACKEND_CONFIG_PATH}}") configPath: String,
    ): SchemaConfig {
        return objectMapper.readValue(File(configPath))
    }

    @Bean
    fun referenceGenome(
        objectMapper: ObjectMapper,
        @Value("\${${BackendSpringProperty.BACKEND_REFERENCE_GENOME_PATH}}") referenceGenomePath: String,
    ): ReferenceGenome {
        return objectMapper.readValue(File(referenceGenomePath))
    }
}
