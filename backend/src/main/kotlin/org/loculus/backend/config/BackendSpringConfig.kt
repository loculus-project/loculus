package org.loculus.backend.config

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import io.swagger.v3.oas.models.headers.Header
import io.swagger.v3.oas.models.media.StringSchema
import io.swagger.v3.oas.models.parameters.HeaderParameter
import org.flywaydb.core.Flyway
import org.jetbrains.exposed.spring.autoconfigure.ExposedAutoConfiguration
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.DatabaseConfig
import org.jetbrains.exposed.sql.Slf4jSqlDebugLogger
import org.jetbrains.exposed.sql.transactions.TransactionManager
import org.jetbrains.exposed.sql.transactions.transaction
import org.loculus.backend.controller.LoculusCustomHeaders
import org.loculus.backend.log.REQUEST_ID_HEADER_DESCRIPTION
import org.loculus.backend.service.submission.dbtables.CurrentProcessingPipelineTable
import org.loculus.backend.utils.DateProvider
import org.springdoc.core.customizers.OperationCustomizer
import org.springframework.beans.factory.InitializingBean
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.ImportAutoConfiguration
import org.springframework.boot.autoconfigure.jdbc.DataSourceTransactionManagerAutoConfiguration
import org.springframework.boot.context.properties.ConfigurationPropertiesScan
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.stereotype.Component
import org.springframework.web.filter.CommonsRequestLoggingFilter
import java.io.File
import javax.sql.DataSource

object BackendSpringProperty {
    const val BACKEND_CONFIG_PATH = "loculus.config.path"
    const val STALE_AFTER_SECONDS = "loculus.cleanup.task.reset-stale-in-processing-after-seconds"
    const val CLEAN_UP_RUN_EVERY_SECONDS = "loculus.cleanup.task.run-every-seconds"
    const val PIPELINE_VERSION_UPGRADE_CHECK_INTERVAL_SECONDS =
        "loculus.pipeline-version-upgrade-check.interval-seconds"
    const val STREAM_BATCH_SIZE = "loculus.stream.batch-size"
    const val DEBUG_MODE = "loculus.debug-mode"
    const val ENABLE_SEQSETS = "loculus.enable-seqsets"

    const val S3_ENABLED = "loculus.s3.enabled"
    const val S3_BUCKET_ENDPOINT = "loculus.s3.bucket.endpoint"
    const val S3_BUCKET_INTERNAL_ENDPOINT = "loculus.s3.bucket.internal-endpoint"
    const val S3_BUCKET_BUCKET = "loculus.s3.bucket.bucket"
    const val S3_BUCKET_REGION = "loculus.s3.bucket.region"
    const val S3_BUCKET_ACCESS_KEY = "loculus.s3.bucket.access-key"
    const val S3_BUCKET_SECRET_KEY = "loculus.s3.bucket.secret-key"
}

const val DEBUG_MODE_ON_VALUE = "true"
const val ENABLE_SEQSETS_TRUE_VALUE = "true"

private val logger = mu.KotlinLogging.logger {}

@Configuration
@ImportAutoConfiguration(
    value = [ExposedAutoConfiguration::class],
    exclude = [DataSourceTransactionManagerAutoConfiguration::class],
)
@ConfigurationPropertiesScan("org.loculus.backend")
class BackendSpringConfig {

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
    fun backendConfig(
        objectMapper: ObjectMapper,
        @Value("\${${BackendSpringProperty.BACKEND_CONFIG_PATH}}") configPath: String,
    ): BackendConfig = readBackendConfig(objectMapper, configPath)

    @Bean
    fun openApi(backendConfig: BackendConfig) = buildOpenApiSchema(backendConfig)

    @Bean
    fun s3Config(
        @Value("\${${BackendSpringProperty.S3_ENABLED}}") enabled: Boolean = false,
        @Value("\${${BackendSpringProperty.S3_BUCKET_ENDPOINT}}") endpoint: String? = null,
        @Value("\${${BackendSpringProperty.S3_BUCKET_INTERNAL_ENDPOINT}:#{null}}") internalEndpoint: String? = null,
        @Value("\${${BackendSpringProperty.S3_BUCKET_REGION}}") region: String? = null,
        @Value("\${${BackendSpringProperty.S3_BUCKET_BUCKET}}") bucket: String? = null,
        @Value("\${${BackendSpringProperty.S3_BUCKET_ACCESS_KEY}}") accessKey: String? = null,
        @Value("\${${BackendSpringProperty.S3_BUCKET_SECRET_KEY}}") secretKey: String? = null,
    ): S3Config {
        if (!enabled) {
            return S3Config(false, null)
        }
        if (endpoint != null && bucket != null && accessKey != null && secretKey != null) {
            return S3Config(true, S3BucketConfig(endpoint, internalEndpoint, region, bucket, accessKey, secretKey))
        }
        throw IllegalStateException("S3 bucket configurations are incomplete.")
    }

    @Bean
    fun headerCustomizer() = OperationCustomizer { operation, _ ->
        val foundRequestIdHeaderParameter = operation.parameters?.any { it.name == LoculusCustomHeaders.REQUEST_ID }
        if (foundRequestIdHeaderParameter == false || foundRequestIdHeaderParameter == null) {
            operation.addParametersItem(
                HeaderParameter().apply {
                    name = LoculusCustomHeaders.REQUEST_ID
                    required = false
                    example = "1747481c-816c-4b60-af20-a61717a35067"
                    description = REQUEST_ID_HEADER_DESCRIPTION
                    schema = StringSchema()
                },
            )
        }
        for ((_, response) in operation.responses) {
            if (response.headers == null || !response.headers.containsKey(LoculusCustomHeaders.REQUEST_ID)) {
                response.addHeaderObject(
                    LoculusCustomHeaders.REQUEST_ID,
                    Header().apply {
                        description = REQUEST_ID_HEADER_DESCRIPTION
                        required = false
                        example = "1747481c-816c-4b60-af20-a61717a35067"
                        schema = StringSchema()
                    },
                )
            }
        }
        operation
    }
}

@Component
@Profile("!test")
class FlywayInit(
    // get Flyway from the Spring autoconfiguration so that Java based migrations can use Spring beans
    private val flyway: Flyway,
    private val backendConfig: BackendConfig,
    private val dateProvider: DateProvider,
    private val dataSource: DataSource,
) : InitializingBean {
    override fun afterPropertiesSet() {
        Database.connect(dataSource)

        flyway.migrate()

        // Since migration V1.10 we need to initialize the CurrentProcessingPipelineTable
        // in code, because the configured organisms are not known in the SQL table definitions.
        logger.info("Initializing CurrentProcessingPipelineTable")
        transaction {
            val insertedRows = CurrentProcessingPipelineTable.setV1ForOrganismsIfNotExist(
                backendConfig.organisms.keys,
                dateProvider.getCurrentDateTime(),
            )
            logger.info("$insertedRows inserted.")
        }
    }
}

/**
 * Check whether configured metadata fields for earliestReleaseDate are actually fields and are of type date.
 * Returns a non-empty list of errors if validation errors were found.
 */
internal fun validateEarliestReleaseDateFields(config: BackendConfig): List<String> {
    val errors = mutableListOf<String>()
    config.organisms.values.forEach {
        val organism = it.schema.organismName
        val allFields = it.schema.metadata.map { it.name }.toSet()
        val dateFields = it.schema.metadata.filter { it.type == MetadataType.DATE }.map { it.name }.toSet()
        it.schema.earliestReleaseDate.externalFields.forEach {
            if (!allFields.contains(it)) {
                errors.add(
                    "Error on organism $organism in earliestReleaseDate.externalFields: " +
                        "Field $it does not exist.",
                )
            } else {
                if (!dateFields.contains(it)) {
                    errors.add(
                        "Error on organism $organism in earliestReleaseDate.externalFields: " +
                            "Field $it is not of type ${MetadataType.DATE}.",
                    )
                }
            }
        }
    }
    return errors
}

fun readBackendConfig(objectMapper: ObjectMapper, configPath: String): BackendConfig {
    val config = objectMapper
        .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
        .readValue<BackendConfig>(File(configPath))
    logger.info { "Loaded backend config from $configPath" }
    logger.info { "Config: $config" }
    val validationErrors = validateEarliestReleaseDateFields(config)
    if (validationErrors.isNotEmpty()) {
        throw IllegalArgumentException(
            "The configuration file at $configPath is invalid: " +
                validationErrors.joinToString(" "),
        )
    }
    return config
}

/**
 * Enables scheduled tasks only when not running tests.
 * This prevents scheduled tasks from running during test execution and trying to access
 * database connections after the test context has shut down.
 */
@Configuration
@EnableScheduling
@Profile("!test & !with-database")
class SchedulingConfig
