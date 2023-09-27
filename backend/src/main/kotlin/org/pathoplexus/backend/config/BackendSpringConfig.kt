package org.pathoplexus.backend.config

import com.fasterxml.jackson.databind.ObjectMapper
import org.flywaydb.core.Flyway
import org.jetbrains.exposed.spring.autoconfigure.ExposedAutoConfiguration
import org.jetbrains.exposed.sql.DatabaseConfig
import org.jetbrains.exposed.sql.Slf4jSqlDebugLogger
import org.pathoplexus.backend.model.SchemaConfig
import org.springframework.boot.autoconfigure.ImportAutoConfiguration
import org.springframework.boot.autoconfigure.jdbc.DataSourceTransactionManagerAutoConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.core.io.ClassPathResource
import org.springframework.web.filter.CommonsRequestLoggingFilter
import javax.sql.DataSource

@Configuration
@ImportAutoConfiguration(
    value = [ExposedAutoConfiguration::class],
    exclude = [DataSourceTransactionManagerAutoConfiguration::class],
)
class BackendSpringConfig(private val objectMapper: ObjectMapper) {

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
    fun schemaConfig(): SchemaConfig {
        val configFile = ClassPathResource("config.json").file
        return objectMapper.readValue(configFile, SchemaConfig::class.java)
    }
}
