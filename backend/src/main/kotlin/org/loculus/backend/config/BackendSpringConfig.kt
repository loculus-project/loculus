package org.loculus.backend.config

import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.headers.Header
import io.swagger.v3.oas.models.media.StringSchema
import io.swagger.v3.oas.models.parameters.HeaderParameter
import io.swagger.v3.oas.models.tags.Tag
import org.flywaydb.core.Flyway
import org.jetbrains.exposed.spring.autoconfigure.ExposedAutoConfiguration
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.DatabaseConfig
import org.jetbrains.exposed.sql.Slf4jSqlDebugLogger
import org.loculus.backend.config.service.ConfigService
import org.loculus.backend.controller.LoculusCustomHeaders
import org.loculus.backend.controller.QueryController
import org.loculus.backend.log.REQUEST_ID_HEADER_DESCRIPTION
import org.springdoc.core.customizers.OpenApiCustomizer
import org.springdoc.core.customizers.OperationCustomizer
import org.springframework.beans.factory.InitializingBean
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.ImportAutoConfiguration
import org.springframework.boot.autoconfigure.jdbc.DataSourceTransactionManagerAutoConfiguration
import org.springframework.boot.context.properties.ConfigurationPropertiesScan
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.stereotype.Component
import org.springframework.web.filter.CommonsRequestLoggingFilter
import javax.sql.DataSource

object BackendSpringProperty {
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
const val LAPIS_PROXY_CONTROLLER_TAG = "lapis-proxy-controller"

private const val LAPIS_PROXY_CONTROLLER_DESCRIPTION =
    "This is temporary and used for calls that have not yet switched to using the new query API."

fun updateLapisProxyOpenApiTags(openApi: OpenAPI) {
    val operationTagNames = openApi.paths.orEmpty().values
        .flatMap { it.readOperations() }
        .flatMap { it.tags.orEmpty() }
        .distinct()
    val tagsByName = linkedMapOf<String, Tag>()
    openApi.tags.orEmpty()
        .filter { it.name in operationTagNames }
        .forEach { tag -> tagsByName[tag.name] = tag }
    operationTagNames.forEach { tagName -> tagsByName.putIfAbsent(tagName, Tag().name(tagName)) }
    tagsByName[LAPIS_PROXY_CONTROLLER_TAG] = tagsByName[LAPIS_PROXY_CONTROLLER_TAG]
        ?: Tag().name(LAPIS_PROXY_CONTROLLER_TAG)
    tagsByName[LAPIS_PROXY_CONTROLLER_TAG]?.description(LAPIS_PROXY_CONTROLLER_DESCRIPTION)
    openApi.tags = orderOpenApiTags(tagsByName.values)
}

private fun orderOpenApiTags(tags: Collection<Tag>) = tags
    .filter { it.name.isNotBlank() }
    .sortedWith(compareBy<Tag> { it.name == LAPIS_PROXY_CONTROLLER_TAG }.thenBy { it.name })

private val logger = mu.KotlinLogging.logger {}

@Configuration
@EnableScheduling
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
    fun openApi() = buildOpenApiSchema()

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

    @Bean
    @Order(Ordered.LOWEST_PRECEDENCE)
    fun lapisProxyTagCustomizer() = OpenApiCustomizer { openApi -> updateLapisProxyOpenApiTags(openApi) }

    @Bean
    fun queryControllerOpenApiCustomizer(configService: ConfigService) =
        OperationCustomizer { operation, handlerMethod ->
            if (handlerMethod.beanType != QueryController::class.java) {
                return@OperationCustomizer operation
            }

            val organismKeys = runCatching { configService.listReleasedOrganisms().map { it.key } }
                .getOrDefault(emptyList())
            val endpointDocs = queryEndpointDocs(handlerMethod.method.name)
            operation.tags = listOf("Query")
            operation.summary = endpointDocs?.summary ?: operation.summary
            operation.description = endpointDocs?.description ?: operation.description
            operation.parameters?.forEach { parameter ->
                when (parameter.name) {
                    "organism" -> {
                        parameter.description = "Organism key configured for this instance."
                        parameter.example = organismKeys.firstOrNull()
                        parameter.schema = StringSchema()._enum(organismKeys)
                    }

                    "versionGroup" -> {
                        parameter.description = "Use current for latest versions or allVersions for version history."
                        parameter.example = "current"
                        parameter.schema = StringSchema()._enum(listOf("current", "allVersions"))
                    }

                    "segment" -> parameter.description = "Sequence segment name as configured in LAPIS."

                    "referenceName" -> parameter.description = "Nucleotide reference name as configured in LAPIS."

                    "geneName" -> parameter.description = "Gene name as configured in LAPIS."
                }
            }
            operation
        }

    private companion object {
        data class QueryEndpointDocs(val summary: String, val description: String)

        fun queryEndpointDocs(methodName: String) =
            QUERY_ENDPOINT_DOCS[methodName] ?: methodName.removeSuffix("Get").let { QUERY_ENDPOINT_DOCS[it] }

        val QUERY_ENDPOINT_DOCS = mapOf(
            "metadata" to QueryEndpointDocs(
                "Query metadata",
                "Return metadata rows for released sequence entries.",
            ),
            "aggregated" to QueryEndpointDocs(
                "Aggregate metadata",
                "Return aggregated metadata counts for released sequence entries.",
            ),
            "sequences" to QueryEndpointDocs(
                "Query unaligned nucleotide sequences",
                "Return unaligned nucleotide sequences for released sequence entries.",
            ),
            "sequencesForSegment" to QueryEndpointDocs(
                "Query unaligned nucleotide sequences by segment",
                "Return unaligned nucleotide sequences for one segment of released sequence entries.",
            ),
            "sequencesAligned" to QueryEndpointDocs(
                "Query aligned nucleotide sequences",
                "Return aligned nucleotide sequences for released sequence entries.",
            ),
            "sequencesAlignedMutations" to QueryEndpointDocs(
                "Query nucleotide mutations",
                "Return nucleotide mutation records for released sequence entries.",
            ),
            "sequencesAlignedInsertions" to QueryEndpointDocs(
                "Query nucleotide insertions",
                "Return nucleotide insertion records for released sequence entries.",
            ),
            "sequencesAlignedAggregatedMutations" to QueryEndpointDocs(
                "Aggregate nucleotide mutations",
                "Return aggregated nucleotide mutations for released sequence entries.",
            ),
            "sequencesAlignedForSegment" to QueryEndpointDocs(
                "Query aligned nucleotide sequences by reference",
                "Return aligned nucleotide sequences for one reference of released sequence entries.",
            ),
            "sequencesAlignedForSegmentMutations" to QueryEndpointDocs(
                "Query nucleotide mutations by reference",
                "Return nucleotide mutation records for one reference.",
            ),
            "sequencesAlignedForSegmentAggregatedMutations" to QueryEndpointDocs(
                "Aggregate nucleotide mutations by reference",
                "Return aggregated nucleotide mutations for one reference.",
            ),
            "translations" to QueryEndpointDocs(
                "Query aligned amino acid sequences",
                "Return aligned amino acid sequences for one gene.",
            ),
            "translationsMutations" to QueryEndpointDocs(
                "Query amino acid mutations",
                "Return amino acid mutation records for released sequence entries.",
            ),
            "translationsInsertions" to QueryEndpointDocs(
                "Query amino acid insertions",
                "Return amino acid insertion records for released sequence entries.",
            ),
            "translationsForGeneMutations" to QueryEndpointDocs(
                "Query amino acid mutations by gene",
                "Return amino acid mutation records for one gene.",
            ),
            "translationsForGeneAggregatedMutations" to QueryEndpointDocs(
                "Aggregate amino acid mutations by gene",
                "Return aggregated amino acid mutations for one gene.",
            ),
        )
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

        logger.info("Flyway migration complete")
    }
}
