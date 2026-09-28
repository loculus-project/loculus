package org.loculus.backend.query

import mu.KotlinLogging
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.query.schema.QuerySchema
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration
import org.springframework.stereotype.Component

private val log = KotlinLogging.logger {}

/**
 * loculus.query-engine.enabled=true            turn the engine on (projection, index, /sample endpoints) for the
 *                                              organisms whose backend config has a `queryEngine` section
 * loculus.query-engine.projector-interval-ms   how often the projector drains the dirty queue
 * loculus.query-engine.tail-interval-ms        how often in-memory indexes poll the changelog
 * loculus.query-engine.reconcile-accessions-per-second
 *                                              rate at which the projector re-marks all released accessions dirty,
 *                                              cycling through them, to heal projections that went stale (0 = off)
 * loculus.query-engine.reconcile-pass-interval-minutes
 *                                              a new reconcile pass of an organism starts at most this often
 * loculus.query-engine.lineage-refresh-interval-ms
 *                                              how often lineage definitions are checked: downloads not yet done are
 *                                              retried, and hierarchies are rebuilt when the observed values changed
 */
@ConfigurationProperties(prefix = "loculus.query-engine")
data class QueryEngineProperties(
    val enabled: Boolean = false,
    val projectorIntervalMs: Long = 500,
    val projectorBatchSize: Int = 2000,
    val tailIntervalMs: Long = 250,
    val reconcileAccessionsPerSecond: Double = 50.0,
    val reconcilePassIntervalMinutes: Long = 360,
    val lineageRefreshIntervalMs: Long = 5_000,
    val instanceName: String? = null,
)

@Configuration
@EnableConfigurationProperties(QueryEngineProperties::class)
class QueryEngineConfiguration

@Component
@ConditionalOnProperty(prefix = "loculus.query-engine", name = ["enabled"], havingValue = "true")
class QuerySchemaRegistry(backendConfig: BackendConfig) {
    val schemas: Map<String, QuerySchema> = backendConfig.organisms.mapNotNull { (organism, instanceConfig) ->
        val config = instanceConfig.queryEngine
        if (config == null) {
            log.warn { "Query engine: no queryEngine config for $organism, organism will not be queryable" }
            return@mapNotNull null
        }
        organism to QuerySchema.build(
            organism,
            instanceConfig.schema.organismName,
            config,
            instanceConfig.referenceGenome,
        )
    }.toMap()

    /** lineage-definition URLs per organism, lineage system and pipeline version */
    val lineageSystemUrls: Map<String, Map<String, Map<Int, String>>> = backendConfig.organisms
        .filterKeys { it in schemas }
        .mapValues { (_, instanceConfig) -> instanceConfig.queryEngine!!.lineageSystems }

    fun get(organism: String): QuerySchema? = schemas[organism]
}
