package org.loculus.backend.controller

import mu.KotlinLogging
import org.junit.jupiter.api.extension.BeforeEachCallback
import org.junit.jupiter.api.extension.ExtendWith
import org.junit.jupiter.api.extension.ExtensionContext
import org.junit.platform.engine.support.descriptor.ClassSource
import org.junit.platform.engine.support.descriptor.MethodSource
import org.junit.platform.launcher.TestExecutionListener
import org.junit.platform.launcher.TestPlan
import org.loculus.backend.api.Address
import org.loculus.backend.api.Group
import org.loculus.backend.controller.datauseterms.DataUseTermsControllerClient
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.seqsetcitations.SeqSetCitationsControllerClient
import org.loculus.backend.controller.submission.SubmissionControllerClient
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.service.datauseterms.DATA_USE_TERMS_TABLE_NAME
import org.loculus.backend.service.groupmanagement.GROUPS_TABLE_NAME
import org.loculus.backend.service.groupmanagement.USER_GROUPS_TABLE_NAME
import org.loculus.backend.service.submission.METADATA_UPLOAD_TABLE_NAME
import org.loculus.backend.service.submission.SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME
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
    DataUseTermsControllerClient::class,
    SeqSetCitationsControllerClient::class,
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
val DEFAULT_GROUP = Group(
    groupName = DEFAULT_GROUP_NAME,
    institution = "testInstitution",
    address = Address(
        line1 = "testAddressLine1",
        line2 = "testAddressLine2",
        postalCode = "testPostalCode",
        city = "testCity",
        state = "testState",
        country = "testCountry",
    ),
    contactEmail = "testEmail",
)

const val DEFAULT_USER_NAME = "testuser"
const val SUPER_USER_NAME = "test_superuser"
const val ALTERNATIVE_DEFAULT_GROUP_NAME = "testGroup2"
const val ALTERNATIVE_DEFAULT_USER_NAME = "testUser2"

val ALTERNATIVE_DEFAULT_GROUP = Group(
    groupName = ALTERNATIVE_DEFAULT_GROUP_NAME,
    institution = "alternativeTestInstitution",
    address = Address(
        line1 = "alternativeTestAddressLine1",
        line2 = "alternativeTestAddressLine2",
        postalCode = "alternativeTestPostalCode",
        city = "alternativeTestCity",
        state = "alternativeTestState",
        country = "alternativeTestCountry",
    ),
    contactEmail = "alternativeTestEmail",
)

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
                createGroupsStatement(listOf(DEFAULT_GROUP, ALTERNATIVE_DEFAULT_GROUP)) +
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

private fun createGroupsStatement(groupNames: List<Group>): String {
    return groupNames.joinToString("\n") {
        "insert into $GROUPS_TABLE_NAME (group_name, institution, address_line_1, " +
            "address_line_2, address_city, address_postal_code, address_state, address_country, contact_email) values" +
            "('${it.groupName}','" +
            "${it.institution}','" +
            "${it.address.line1}','" +
            "${it.address.line2}','" +
            "${it.address.city}','" +
            "${it.address.postalCode}','" +
            "${it.address.state}','" +
            "${it.address.country}','" +
            "${it.contactEmail}');"
    } + "\n"
}

private fun clearDatabaseStatement(): String {
    return "truncate table $GROUPS_TABLE_NAME cascade; " +
        "truncate table $SEQUENCE_ENTRIES_TABLE_NAME; " +
        "truncate table $SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME; " +
        "alter sequence $ACCESSION_SEQUENCE_NAME restart with 1; " +
        "truncate table $USER_GROUPS_TABLE_NAME; " +
        "truncate $METADATA_UPLOAD_TABLE_NAME; " +
        "truncate $SEQUENCE_UPLOAD_TABLE_NAME; " +
        "truncate table $DATA_USE_TERMS_TABLE_NAME cascade; \n"
}

private fun addUsersToGroupStatement(groupName: String, userNames: List<String>): String {
    return userNames.joinToString("\n") {
        "insert into $USER_GROUPS_TABLE_NAME (group_name, user_name) values ('$groupName', '$it');"
    } + "\n"
}
