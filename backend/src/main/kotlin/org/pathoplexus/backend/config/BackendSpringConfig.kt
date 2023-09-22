package org.pathoplexus.backend.config

import com.fasterxml.jackson.databind.ObjectMapper
import com.mchange.v2.c3p0.ComboPooledDataSource
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.flywaydb.core.Flyway
import org.ktorm.database.Database
import org.pathoplexus.backend.model.SchemaConfig
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.core.io.ClassPathResource
import org.springframework.core.io.ResourceLoader
import org.springframework.jdbc.support.JdbcTransactionManager
import org.springframework.transaction.annotation.EnableTransactionManagement
import org.springframework.web.filter.CommonsRequestLoggingFilter

@Configuration
@EnableTransactionManagement
class BackendSpringConfig(private val objectMapper: ObjectMapper, private val resourceLoader: ResourceLoader) {

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
    @Profile("!test")
    fun dataSource(databaseProperties: DatabaseProperties): HikariDataSource {
        val config = HikariConfig()
        config.jdbcUrl = databaseProperties.jdbcUrl
        config.username = databaseProperties.username
        config.password = databaseProperties.password
        config.driverClassName = databaseProperties.driver
        return HikariDataSource(config)
    }

    @Bean
    @Profile("!test")
    fun getFlyway(dataSource: HikariDataSource): Flyway {
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

    @Bean
    fun comboPooledDataSource(databaseProperties: DatabaseProperties)= ComboPooledDataSource().apply {
        driverClass = databaseProperties.driver
        jdbcUrl = databaseProperties.jdbcUrl
        user = databaseProperties.username
        password = databaseProperties.password
    }

    @Bean
    fun db(pool: ComboPooledDataSource) = Database.connectWithSpringSupport(pool)

    @Bean
    fun transactionManager(pool: ComboPooledDataSource) = JdbcTransactionManager(pool)
}
