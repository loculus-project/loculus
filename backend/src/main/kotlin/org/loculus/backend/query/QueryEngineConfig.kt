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
 * loculus.query-engine.reload-wait-ms          how long a request waits for its organism's index while it is being
 *                                              (re)loaded before answering 503
 * loculus.query-engine.stale-after-tail-failure-ms
 *                                              an organism whose index updates have failed without a break for this
 *                                              long answers 503 until they succeed again
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
    val reloadWaitMs: Long = 30_000,
    val staleAfterTailFailureMs: Long = 120_000,
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
            log.error {
                "Query engine: no queryEngine config for $organism, organism will not be queryable and the pod " +
                    "will not become ready"
            }
            return@mapNotNull null
        }
        organism to QuerySchema.build(
            organism,
            instanceConfig.schema.organismName,
            config,
            instanceConfig.referenceGenome,
        )
    }.toMap()

    /**
     * organisms in the backend config without a queryEngine section. The chart gives every organism one while the
     * engine is enabled, so this only happens when image and config disagree; readiness then fails
     * ([org.loculus.backend.query.index.QueryIndexHealthIndicator]) instead of answering 404 for those organisms.
     */
    val notQueryable: List<String> = backendConfig.organisms.keys.filter { it !in schemas }

    /** lineage-definition URLs per organism, lineage system and pipeline version */
    val lineageSystemUrls: Map<String, Map<String, Map<Int, String>>> = backendConfig.organisms
        .filterKeys { it in schemas }
        .mapValues { (_, instanceConfig) -> instanceConfig.queryEngine!!.lineageSystems }

    fun get(organism: String): QuerySchema? = schemas[organism]
}
