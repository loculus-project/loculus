package org.loculus.backend.config

import org.flywaydb.core.Flyway
import org.jetbrains.exposed.v1.core.DatabaseConfig
import org.jetbrains.exposed.v1.core.Slf4jSqlDebugLogger
import org.jetbrains.exposed.v1.jdbc.Database
import org.jetbrains.exposed.v1.spring.boot4.autoconfigure.ExposedAutoConfiguration
import org.loculus.backend.auth.UserConverter
import org.springframework.beans.factory.InitializingBean
import org.springframework.boot.autoconfigure.ImportAutoConfiguration
import org.springframework.boot.context.properties.ConfigurationPropertiesScan
import org.springframework.boot.jdbc.autoconfigure.DataSourceTransactionManagerAutoConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import javax.sql.DataSource

@Configuration
@ImportAutoConfiguration(
    value = [ExposedAutoConfiguration::class],
    exclude = [DataSourceTransactionManagerAutoConfiguration::class],
)
@ConfigurationPropertiesScan("org.loculus.backend")
class CoreSpringConfig : WebMvcConfigurer {

    @Bean
    fun databaseConfig() = DatabaseConfig {
        useNestedTransactions = true
        sqlLogger = Slf4jSqlDebugLogger
    }

    override fun addArgumentResolvers(resolvers: MutableList<HandlerMethodArgumentResolver>) {
        resolvers.add(UserConverter())
    }
}

@Component
@Profile("!test")
class FlywayInit(
    // get Flyway from the Spring autoconfiguration so that Java based migrations can use Spring beans
    private val flyway: Flyway,
    private val dataSource: DataSource,
) : InitializingBean {
    override fun afterPropertiesSet() {
        Database.connect(dataSource)

        flyway.migrate()
    }
}
