package org.loculus.backend.controller

import io.minio.MakeBucketArgs
import io.minio.MinioClient
import io.minio.SetBucketPolicyArgs
import mu.KotlinLogging
import org.junit.jupiter.api.extension.BeforeEachCallback
import org.junit.jupiter.api.extension.ExtendWith
import org.junit.jupiter.api.extension.ExtensionContext
import org.junit.platform.engine.support.descriptor.ClassSource
import org.junit.platform.engine.support.descriptor.MethodSource
import org.junit.platform.launcher.TestExecutionListener
import org.junit.platform.launcher.TestPlan
import org.loculus.backend.api.Address
import org.loculus.backend.api.NewGroup
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.datauseterms.DataUseTermsControllerClient
import org.loculus.backend.controller.files.FilesClient
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.seqsetcitations.SeqSetCitationsControllerClient
import org.loculus.backend.controller.submission.SubmissionControllerClient
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.service.datauseterms.DATA_USE_TERMS_TABLE_NAME
import org.loculus.backend.service.files.FILES_TABLE_NAME
import org.loculus.backend.service.groupmanagement.GROUPS_TABLE_NAME
import org.loculus.backend.service.groupmanagement.USER_GROUPS_TABLE_NAME
import org.loculus.backend.service.submission.CURRENT_PROCESSING_PIPELINE_TABLE_NAME
import org.loculus.backend.service.submission.METADATA_UPLOAD_AUX_TABLE_NAME
import org.loculus.backend.service.submission.SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME
import org.loculus.backend.service.submission.SEQUENCE_ENTRIES_TABLE_NAME
import org.loculus.backend.service.submission.SEQUENCE_UPLOAD_AUX_TABLE_NAME
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.core.annotation.AliasFor
import org.springframework.test.annotation.DirtiesContext
import org.springframework.test.context.ActiveProfiles
import org.testcontainers.containers.MinIOContainer
import org.testcontainers.containers.PostgreSQLContainer
import java.net.Socket
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.TimeUnit

/**
 * The main annotation for tests. It also loads the [EndpointTestExtension], which initializes
 * a PostgreSQL test container.
 * You can set additional properties to - for example - override the backend config file, like in
 * [org.loculus.backend.controller.submission.GetReleasedDataDataUseTermsDisabledEndpointTest].
 */
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
    FilesClient::class,
)
annotation class EndpointTest(@get:AliasFor(annotation = SpringBootTest::class) val properties: Array<String> = [])

const val SINGLE_SEGMENTED_REFERENCE_GENOME = "src/test/resources/backend_config_single_segment.json"

const val DATA_USE_TERMS_DISABLED_CONFIG = "src/test/resources/backend_config_data_use_terms_disabled.json"

const val S3_CONFIG = "src/test/resources/backend_config_s3.json"

private const val SPRING_DATASOURCE_URL = "spring.datasource.url"
private const val SPRING_DATASOURCE_USERNAME = "spring.datasource.username"
private const val SPRING_DATASOURCE_PASSWORD = "spring.datasource.password"

const val ACCESSION_SEQUENCE_NAME = "accession_sequence"
const val DEFAULT_GROUP_NAME = "testGroup"
const val DEFAULT_GROUP_NAME_CHANGED = "testGroup name updated"
val DEFAULT_GROUP = NewGroup(
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
val DEFAULT_GROUP_CHANGED = NewGroup(
    groupName = DEFAULT_GROUP_NAME_CHANGED,
    institution = "Updated institution",
    address = Address(
        line1 = "Updated address line 1",
        line2 = "Updated address line 2",
        postalCode = "Updated post code",
        city = "Updated city",
        state = "Updated state",
        country = "Updated country",
    ),
    contactEmail = "Updated email",
)

const val DEFAULT_USER_NAME = "testuser"
const val SUPER_USER_NAME = "test_superuser"
const val ALTERNATIVE_DEFAULT_GROUP_NAME = "testGroup2"
const val ALTERNATIVE_DEFAULT_USER_NAME = "testUser2"

val ALTERNATIVE_DEFAULT_GROUP = NewGroup(
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

val MINIO_TEST_REGION = "testregion"
val MINIO_TEST_BUCKET = "testbucket"

private val log = KotlinLogging.logger { }

class EndpointTestExtension :
    BeforeEachCallback,
    TestExecutionListener {
    companion object {
        private val useLocal = System.getenv("USE_LOCAL_SERVICES") == "true"
        private val postgres: PostgresService = if (useLocal) LocalPostgresService() else ContainerPostgresService()
        private val minio: MinioService = if (useLocal) LocalMinioService() else ContainerMinioService()
        private var isStarted = false
        private var isBucketCreated = false
    }

    override fun testPlanExecutionStarted(testPlan: TestPlan) {
        if (!isStarted) {
            isAnnotatedWithEndpointTest(testPlan) {
                postgres.start()
                minio.start()
                isStarted = true
                if (!isBucketCreated) {
                    createBucket(minio.s3URL, minio.userName, minio.password, MINIO_TEST_REGION, MINIO_TEST_BUCKET)
                    isBucketCreated = true
                }
            }
        }

        log.info {
            "Started Postgres service at ${postgres.jdbcUrl}, user ${postgres.username}"
            "Started MinIO service at ${minio.s3URL}, user ${minio.userName}"
        }

        System.setProperty(SPRING_DATASOURCE_URL, postgres.jdbcUrl)
        System.setProperty(SPRING_DATASOURCE_USERNAME, postgres.username)
        System.setProperty(SPRING_DATASOURCE_PASSWORD, postgres.password)

        System.setProperty(BackendSpringProperty.S3_ENABLED, "true")
        System.setProperty(BackendSpringProperty.S3_BUCKET_ENDPOINT, minio.s3URL)
        System.setProperty(BackendSpringProperty.S3_BUCKET_REGION, MINIO_TEST_REGION)
        System.setProperty(BackendSpringProperty.S3_BUCKET_BUCKET, MINIO_TEST_BUCKET)
        System.setProperty(BackendSpringProperty.S3_BUCKET_ACCESS_KEY, minio.userName)
        System.setProperty(BackendSpringProperty.S3_BUCKET_SECRET_KEY, minio.password)
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
        log.debug("Clearing database")
        postgres.exec(clearDatabaseStatement())
    }

    override fun testPlanExecutionFinished(testPlan: TestPlan) {
        postgres.stop()
        minio.stop()

        System.clearProperty(SPRING_DATASOURCE_URL)
        System.clearProperty(SPRING_DATASOURCE_USERNAME)
        System.clearProperty(SPRING_DATASOURCE_PASSWORD)

        System.clearProperty(BackendSpringProperty.S3_ENABLED)
        System.clearProperty(BackendSpringProperty.S3_BUCKET_ENDPOINT)
        System.clearProperty(BackendSpringProperty.S3_BUCKET_REGION)
        System.clearProperty(BackendSpringProperty.S3_BUCKET_BUCKET)
        System.clearProperty(BackendSpringProperty.S3_BUCKET_ACCESS_KEY)
        System.clearProperty(BackendSpringProperty.S3_BUCKET_SECRET_KEY)
    }
}

private fun clearDatabaseStatement(): String = """
        truncate table 
            $GROUPS_TABLE_NAME,
            $SEQUENCE_ENTRIES_TABLE_NAME,
            $SEQUENCE_ENTRIES_PREPROCESSED_DATA_TABLE_NAME,
            $USER_GROUPS_TABLE_NAME,
            $METADATA_UPLOAD_AUX_TABLE_NAME,
            $SEQUENCE_UPLOAD_AUX_TABLE_NAME,
            $DATA_USE_TERMS_TABLE_NAME,
            $CURRENT_PROCESSING_PIPELINE_TABLE_NAME,
            $FILES_TABLE_NAME
            cascade;
        alter sequence $ACCESSION_SEQUENCE_NAME restart with 1;
        insert into $CURRENT_PROCESSING_PIPELINE_TABLE_NAME values
            (1, now(), '$DEFAULT_ORGANISM'),
            (1, now(), '$OTHER_ORGANISM'),
            (1, now(), '$ORGANISM_WITHOUT_CONSENSUS_SEQUENCES');
    """

private fun createBucket(endpoint: String, user: String, password: String, region: String, bucket: String) {
    val minioClient = MinioClient
        .builder()
        .endpoint(endpoint)
        .credentials(user, password)
        .build()
    minioClient.makeBucket(
        MakeBucketArgs.builder()
            .region(region)
            .bucket(bucket)
            .build(),
    )
    val policy = """
    {
      "Version":"2012-10-17",
      "Statement":[
        {
          "Effect":"Allow",
          "Principal":"*",
          "Action":"s3:GetObject",
          "Resource":["arn:aws:s3:::$bucket/*"],
          "Condition":{
            "StringEquals":{
              "s3:ExistingObjectTag/public":"true"
            }
          }
        }
      ]
    }
    """.trimIndent()

    minioClient.setBucketPolicy(SetBucketPolicyArgs.builder().bucket(bucket).region(region).config(policy).build())
}

private interface PostgresService {
    val jdbcUrl: String
    val username: String
    val password: String
    val databaseName: String

    fun start()
    fun stop()
    fun exec(sql: String)
}

private interface MinioService {
    val s3URL: String
    val userName: String
    val password: String

    fun start()
    fun stop()
}

private class ContainerPostgresService : PostgresService {
    private val container = PostgreSQLContainer<Nothing>("postgres:latest")

    override val jdbcUrl: String get() = container.jdbcUrl
    override val username: String get() = container.username
    override val password: String get() = container.password
    override val databaseName: String get() = container.databaseName

    override fun start() {
        container.start()
    }

    override fun stop() {
        container.stop()
    }

    override fun exec(sql: String) {
        val result = container.execInContainer(
            "psql",
            "-U",
            container.username,
            "-d",
            container.databaseName,
            "-c",
            sql,
        )
        if (result.exitCode != 0) {
            throw RuntimeException(
                "Database command failed with exit code ${result.exitCode}. Stderr: ${result.stderr}",
            )
        }
    }
}

private class LocalPostgresService : PostgresService {
    private val binDir = Path.of("/workspace/depencies/postgres/postgresql-17.5.0-x86_64-unknown-linux-gnu/bin")
    private val dataDir = Files.createTempDirectory("pgdata")
    private var process: Process? = null

    override val username: String = "test"
    override val password: String = "test"
    override val databaseName: String = "test"
    private val port: Int = 5432
    override val jdbcUrl: String = "jdbc:postgresql://localhost:$port/$databaseName"

    override fun start() {
        val pwFile = Files.createTempFile("pg", "pw").toFile().apply { writeText(password) }
        ProcessBuilder(binDir.resolve("initdb").toString(), "-A", "password", "-U", username, "--pwfile", pwFile.absolutePath, "-D", dataDir.toString())
            .inheritIO()
            .start()
            .waitFor()
        pwFile.delete()
        process = ProcessBuilder(binDir.resolve("postgres").toString(), "-D", dataDir.toString(), "-p", port.toString())
            .inheritIO()
            .start()
        waitForReady()
        ProcessBuilder(binDir.resolve("createdb").toString(), "-p", port.toString(), "-U", username, databaseName)
            .inheritIO()
            .start()
            .waitFor()
    }

    private fun waitForReady() {
        repeat(30) {
            val ready = ProcessBuilder(binDir.resolve("pg_isready").toString(), "-p", port.toString())
                .start()
                .waitFor(1, TimeUnit.SECONDS)
            if (ready && it > 1) return
            Thread.sleep(500)
        }
        throw RuntimeException("Postgres did not start")
    }

    override fun stop() {
        process?.destroy()
        process?.waitFor(5, TimeUnit.SECONDS)
        dataDir.toFile().deleteRecursively()
    }

    override fun exec(sql: String) {
        val result = ProcessBuilder(
            binDir.resolve("psql").toString(),
            "-U",
            username,
            "-d",
            databaseName,
            "-p",
            port.toString(),
            "-c",
            sql,
        ).inheritIO().start()
        if (!result.waitFor(10, TimeUnit.SECONDS) || result.exitValue() != 0) {
            throw RuntimeException("Database command failed")
        }
    }
}

private class ContainerMinioService : MinioService {
    private val container = MinIOContainer("minio/minio:latest").withReuse(true)

    override val s3URL: String get() = container.s3URL
    override val userName: String get() = container.userName
    override val password: String get() = container.password

    override fun start() {
        container.start()
    }

    override fun stop() {
        container.stop()
    }
}

private class LocalMinioService : MinioService {
    private val binary = Path.of("/workspace/depencies/minio")
    private val dataDir = Files.createTempDirectory("minio-data")
    private var process: Process? = null
    private val port = 9000
    override val s3URL: String = "http://127.0.0.1:$port"
    override val userName: String = "minioadmin"
    override val password: String = "minioadmin"

    override fun start() {
        process = ProcessBuilder(
            binary.toString(),
            "server",
            dataDir.toString(),
            "--address",
            "127.0.0.1:$port",
            "--console-address",
            "127.0.0.1:9001",
        )
            .inheritIO()
            .apply {
                environment()["MINIO_ROOT_USER"] = userName
                environment()["MINIO_ROOT_PASSWORD"] = password
            }
            .start()
        waitForPort()
    }

    private fun waitForPort() {
        repeat(30) {
            try {
                Socket("127.0.0.1", port).use { return }
            } catch (_: Exception) {
                Thread.sleep(500)
            }
        }
        throw RuntimeException("Minio did not start")
    }

    override fun stop() {
        process?.destroy()
        process?.waitFor(5, TimeUnit.SECONDS)
        dataDir.toFile().deleteRecursively()
    }
}
