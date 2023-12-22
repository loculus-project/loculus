package org.loculus.backend.controller

import mu.KotlinLogging
import org.junit.jupiter.api.extension.BeforeEachCallback
import org.junit.jupiter.api.extension.ExtendWith
import org.junit.jupiter.api.extension.ExtensionContext
import org.junit.platform.engine.support.descriptor.ClassSource
import org.junit.platform.engine.support.descriptor.MethodSource
import org.junit.platform.launcher.TestExecutionListener
import org.junit.platform.launcher.TestPlan
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.submission.DEFAULT_USER_NAME
import org.loculus.backend.controller.submission.SubmissionControllerClient
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.service.groupmanagement.GROUPS_TABLE_NAME
import org.loculus.backend.service.groupmanagement.USER_GROUPS_TABLE_NAME
import org.loculus.backend.service.submission.METADATA_UPLOAD_TABLE_NAME
import org.loculus.backend.service.submission.SEQUENCE_ENTRIES_TABLE_NAME
import org.loculus.backend.service.submission.SEQUENCE_UPLOAD_TABLE_NAME
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
const val DEFAULT_GROUP_NAME = "testGroup"
const val ALTERNATIVE_DEFAULT_GROUP_NAME = "testGroup2"
const val ALTERNATIVE_DEFAULT_USER_NAME = "testUser2"

private val log = KotlinLogging.logger { }

class EndpointTestExtension : BeforeEachCallback, TestExecutionListener {
    companion object {
        private val postgres: PostgreSQLContainer<*> = PostgreSQLContainer<Nothing>("postgres:latest")
        private var isStarted = false
    }

    override fun testPlanExecutionStarted(testPlan: TestPlan) {
        if (!isStarted) {
            isAnnotatedWithEndpointTest(testPlan) {
                postgres.start()
                isStarted = true
            }
        }

        log.info {
            "Started Postgres container: ${postgres.jdbcUrl}, user ${postgres.username}, pw ${postgres.password}"
        }

        System.setProperty(SPRING_DATASOURCE_URL, postgres.jdbcUrl)
        System.setProperty(SPRING_DATASOURCE_USERNAME, postgres.username)
        System.setProperty(SPRING_DATASOURCE_PASSWORD, postgres.password)
    }

    private fun isAnnotatedWithEndpointTest(testPlan: TestPlan, callback: () -> Unit) {
        for (root in testPlan.roots) {
            testPlan.getChildren(root).forEach { testIdentifier ->
                testIdentifier.source.ifPresent { testSource ->
                    when (testSource) {
                        is MethodSource -> {
                            val testClass = Class.forName(testSource.className)
                            val method = testClass.getMethod(testSource.methodName)
                            if (method.isAnnotationPresent(EndpointTest::class.java)) {
                                callback()
                            }
                        }

                        is ClassSource -> {
                            val testClass = Class.forName(testSource.className)
                            if (testClass.isAnnotationPresent(EndpointTest::class.java)) {
                                callback()
                            }
                        }
                    }
                }
            }
        }
    }

    override fun beforeEach(context: ExtensionContext) {
        postgres.execInContainer(
            "psql",
            "-U",
            postgres.username,
            "-d",
            postgres.databaseName,
            "-c",
            clearDatabaseStatement() +
                createGroupsStatement(listOf(DEFAULT_GROUP_NAME, ALTERNATIVE_DEFAULT_GROUP_NAME)) +
                addUsersToGroupStatement(
                    DEFAULT_GROUP_NAME,
                    listOf(DEFAULT_USER_NAME, ALTERNATIVE_DEFAULT_USER_NAME),
                ) +
                addUsersToGroupStatement(ALTERNATIVE_DEFAULT_GROUP_NAME, listOf(DEFAULT_USER_NAME)),
        )
    }

    override fun testPlanExecutionFinished(testPlan: TestPlan) {
        postgres.stop()

        System.clearProperty(SPRING_DATASOURCE_URL)
        System.clearProperty(SPRING_DATASOURCE_USERNAME)
        System.clearProperty(SPRING_DATASOURCE_PASSWORD)
    }
}

private fun createGroupsStatement(groupNames: List<String>): String {
    return groupNames.joinToString("\n") {
        "insert into $GROUPS_TABLE_NAME (group_name) values ('$it');"
    } + "\n"
}

private fun clearDatabaseStatement(): String {
    return "truncate table $GROUPS_TABLE_NAME cascade; " +
        "truncate table $SEQUENCE_ENTRIES_TABLE_NAME; " +
        "alter sequence $ACCESSION_SEQUENCE_NAME restart with 1; " +
        "truncate table $USER_GROUPS_TABLE_NAME; " +
        "truncate $METADATA_UPLOAD_TABLE_NAME; " +
        "truncate $SEQUENCE_UPLOAD_TABLE_NAME; \n"
}

private fun addUsersToGroupStatement(groupName: String, userNames: List<String>): String {
    return userNames.joinToString("\n") {
        "insert into $USER_GROUPS_TABLE_NAME (group_name, user_name) values ('$groupName', '$it');"
    } + "\n"
}
