package org.loculus.backend.config

import org.jetbrains.exposed.spring.DatabaseInitializer
import org.jetbrains.exposed.spring.ExposedSpringTransactionAttributeSource
import org.jetbrains.exposed.spring.SpringTransactionManager
import org.jetbrains.exposed.sql.DatabaseConfig
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.ApplicationContext
import org.springframework.context.annotation.Bean
import javax.sql.DataSource

// Compatibility shim for EXPOSED-944 (Boot 4 moved DataSourceAutoConfiguration packages).
@AutoConfiguration(
    afterName = [
        "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration",
        "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration",
    ],
)
class ExposedAutoConfigurationCompat(private val applicationContext: ApplicationContext) {
    @Value("\${spring.exposed.excluded-packages:}#{T(java.util.Collections).emptyList()}")
    private lateinit var excludedPackages: List<String>

    @Value("\${spring.exposed.show-sql:false}")
    private var showSql: Boolean = false

    @Bean
    fun springTransactionManager(dataSource: DataSource, databaseConfig: DatabaseConfig): SpringTransactionManager =
        SpringTransactionManager(dataSource, databaseConfig, showSql)

    @Bean
    @ConditionalOnMissingBean
    fun databaseConfig(): DatabaseConfig = DatabaseConfig { }

    @Bean
    @ConditionalOnProperty(value = ["spring.exposed.generate-ddl"], havingValue = "true")
    fun databaseInitializer(): DatabaseInitializer = DatabaseInitializer(applicationContext, excludedPackages)

    @Bean
    fun exposedSpringTransactionAttributeSource(): ExposedSpringTransactionAttributeSource =
        ExposedSpringTransactionAttributeSource()
}
