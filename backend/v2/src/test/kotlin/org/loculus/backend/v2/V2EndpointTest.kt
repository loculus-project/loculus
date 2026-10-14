package org.loculus.backend.v2

import org.junit.jupiter.api.extension.BeforeAllCallback
import org.junit.jupiter.api.extension.BeforeEachCallback
import org.junit.jupiter.api.extension.ExtendWith
import org.junit.jupiter.api.extension.ExtensionContext
import org.loculus.backend.controller.PublicJwtKeyConfig
import org.loculus.backend.testutil.TestEnvironment
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.test.context.DynamicPropertyRegistrar
import org.springframework.test.context.DynamicPropertyRegistry

/**
 * Runs the test against core and v2 with a PostgreSQL database that has all migrations applied.
 * The tables used by v2 are emptied before each test.
 */
@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
@SpringBootTest
@AutoConfigureMockMvc
@ExtendWith(V2EndpointTestExtension::class)
@Import(PublicJwtKeyConfig::class, V2DatasourceProperties::class)
annotation class V2EndpointTest

private val postgres = TestEnvironment().postgres

class V2EndpointTestExtension :
    BeforeAllCallback,
    BeforeEachCallback {

    override fun beforeAll(context: ExtensionContext) {
        context.root.getStore(ExtensionContext.Namespace.GLOBAL).computeIfAbsent(Database::class.java)
    }

    override fun beforeEach(context: ExtensionContext) {
        postgres.exec("truncate table groups_table, user_groups_table, audit_log cascade;")
    }

    internal class Database : AutoCloseable {
        init {
            postgres.start()
        }

        override fun close() = postgres.stop()
    }
}

class V2DatasourceProperties : DynamicPropertyRegistrar {
    override fun accept(registry: DynamicPropertyRegistry) {
        registry.add("spring.datasource.url") { postgres.jdbcUrl }
        registry.add("spring.datasource.username") { postgres.username }
        registry.add("spring.datasource.password") { postgres.password }
    }
}
