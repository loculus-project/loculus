package org.loculus.api

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.extension.BeforeAllCallback
import org.junit.jupiter.api.extension.BeforeEachCallback
import org.junit.jupiter.api.extension.ExtendWith
import org.junit.jupiter.api.extension.ExtensionContext
import org.loculus.api.groups.GroupClient
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.core.annotation.AliasFor
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistrar
import org.springframework.test.context.DynamicPropertyRegistry
import org.testcontainers.postgresql.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName
import java.sql.DriverManager

/**
 * Spring Boot test against a Postgres database whose schema was created by the backend's Flyway migrations,
 * so the tests catch drift between this service's table definitions and the schema the backend owns.
 */
@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@ExtendWith(DatabaseExtension::class)
@Import(TestJwtDecoderConfig::class, TestDatasourceProperties::class, GroupClient::class)
annotation class ApiTest(@get:AliasFor(annotation = SpringBootTest::class) val properties: Array<String> = [])

private const val BACKEND_MIGRATIONS_PROPERTY = "loculus.backend.migrations"

// Same image as the backend tests
private val postgresImage = DockerImageName.parse("ghcr.io/loculus-project/mirror/postgres:15.19")
    .asCompatibleSubstituteFor("postgres")

private val postgres: PostgreSQLContainer by lazy {
    PostgreSQLContainer(postgresImage)
        .also { it.start() }
        .also { migrateWithBackendMigrations(it) }
}

private fun migrateWithBackendMigrations(container: PostgreSQLContainer) {
    val migrations = checkNotNull(System.getProperty(BACKEND_MIGRATIONS_PROPERTY)) {
        "System property $BACKEND_MIGRATIONS_PROPERTY must point to the backend's Flyway migrations"
    }
    Flyway.configure()
        .dataSource(container.jdbcUrl, container.username, container.password)
        .locations("filesystem:$migrations")
        .load()
        .migrate()
}

class DatabaseExtension :
    BeforeAllCallback,
    BeforeEachCallback {
    override fun beforeAll(context: ExtensionContext) {
        postgres
    }

    override fun beforeEach(context: ExtensionContext) {
        executeSql(
            """
            truncate table groups_table, user_groups_table, audit_log cascade;
            alter sequence groups_table_group_id_seq restart with 1;
            alter sequence user_groups_table_id_seq restart with 1;
            """,
        )
    }
}

fun executeSql(sql: String) {
    DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
        connection.createStatement().use { it.execute(sql) }
    }
}

fun querySingleColumn(sql: String): List<String> =
    DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
        connection.createStatement().use { statement ->
            statement.executeQuery(sql).use { resultSet ->
                buildList { while (resultSet.next()) add(resultSet.getString(1)) }
            }
        }
    }

class TestDatasourceProperties : DynamicPropertyRegistrar {
    override fun accept(registry: DynamicPropertyRegistry) {
        registry.add("spring.datasource.url") { postgres.jdbcUrl }
        registry.add("spring.datasource.username") { postgres.username }
        registry.add("spring.datasource.password") { postgres.password }
    }
}
