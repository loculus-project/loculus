package org.pathoplexus.backend.controller.submission

import org.junit.jupiter.api.extension.AfterAllCallback
import org.junit.jupiter.api.extension.BeforeAllCallback
import org.junit.jupiter.api.extension.BeforeEachCallback
import org.junit.jupiter.api.extension.ExtendWith
import org.junit.jupiter.api.extension.ExtensionContext
import org.pathoplexus.backend.controller.PublicJwtKeyConfig
import org.pathoplexus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.pathoplexus.backend.service.GROUPS_TABLE_NAME
import org.pathoplexus.backend.service.SEQUENCE_ENTRIES_TABLE_NAME
import org.pathoplexus.backend.service.USER_GROUPS_TABLE_NAME
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.core.annotation.AliasFor
import org.springframework.test.annotation.DirtiesContext
import org.springframework.test.context.ActiveProfiles
import org.testcontainers.containers.PostgreSQLContainer

@Target(AnnotationTarget.TYPE, AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
@AutoConfigureMockMvc
@SpringBootTest
@ActiveProfiles("with-database")
@ExtendWith(EndpointTestExtension::class)
@DirtiesContext
@Import(
    SubmissionControllerClient::class,
    SubmissionConvenienceClient::class,
    GroupManagementControllerClient::class,
    PublicJwtKeyConfig::class,
)
annotation class EndpointTest(
    @get:AliasFor(annotation = SpringBootTest::class) val properties: Array<String> = [],
)

private const val SPRING_DATASOURCE_URL = "spring.datasource.url"
private const val SPRING_DATASOURCE_USERNAME = "spring.datasource.username"
private const val SPRING_DATASOURCE_PASSWORD = "spring.datasource.password"

const val ACCESSION_SEQUENCE_NAME = "accession_sequence"

class EndpointTestExtension : BeforeEachCallback, AfterAllCallback, BeforeAllCallback {
    companion object {
        private val postgres: PostgreSQLContainer<*> = PostgreSQLContainer<Nothing>("postgres:latest")
    }

    override fun beforeAll(context: ExtensionContext) {
        postgres.start()

        System.setProperty(SPRING_DATASOURCE_URL, postgres.jdbcUrl)
        System.setProperty(SPRING_DATASOURCE_USERNAME, postgres.username)
        System.setProperty(SPRING_DATASOURCE_PASSWORD, postgres.password)
    }

    override fun beforeEach(context: ExtensionContext) {
        postgres.execInContainer(
            "psql",
            "-U",
            postgres.username,
            "-d",
            postgres.databaseName,
            "-c",
            "truncate table $SEQUENCE_ENTRIES_TABLE_NAME; " +
                "alter sequence $ACCESSION_SEQUENCE_NAME restart with 1; " +
                "truncate table $GROUPS_TABLE_NAME cascade;",
            "truncate tabel $USER_GROUPS_TABLE_NAME cascade;",
        )
    }

    override fun afterAll(context: ExtensionContext) {
        postgres.stop()

        System.clearProperty(SPRING_DATASOURCE_URL)
        System.clearProperty(SPRING_DATASOURCE_USERNAME)
        System.clearProperty(SPRING_DATASOURCE_PASSWORD)
    }
}
