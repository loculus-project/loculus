package org.loculus.backend.query

import mu.KotlinLogging
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.query.schema.LineageDefinition
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.schema.SiloConfigReader
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration
import org.springframework.stereotype.Component
import java.io.File

private val log = KotlinLogging.logger {}

/**
 * loculus.query-engine.enabled=true            turn the engine on (projection, index, /sample endpoints)
 * loculus.query-engine.config-dir=/path        contains <organism>/database_config.yaml (the SILO database
 *                                              config) and <organism>/<lineageSystem>.yaml lineage files
 * loculus.query-engine.projector-interval-ms   how often the projector drains the dirty queue
 * loculus.query-engine.tail-interval-ms        how often in-memory indexes poll the changelog
 */
@ConfigurationProperties(prefix = "loculus.query-engine")
data class QueryEngineProperties(
    val enabled: Boolean = false,
    val configDir: String = "/config/query-engine",
    val projectorIntervalMs: Long = 500,
    val projectorBatchSize: Int = 2000,
    val tailIntervalMs: Long = 250,
    val instanceName: String? = null,
)

@Configuration
@EnableConfigurationProperties(QueryEngineProperties::class)
class QueryEngineConfiguration

@Component
@ConditionalOnProperty(prefix = "loculus.query-engine", name = ["enabled"], havingValue = "true")
class QuerySchemaRegistry(backendConfig: BackendConfig, properties: QueryEngineProperties) {
    val schemas: Map<String, QuerySchema> = backendConfig.organisms.mapNotNull { (organism, instanceConfig) ->
        val dir = File(properties.configDir, organism)
        val dbConfigFile = File(dir, "database_config.yaml")
        if (!dbConfigFile.exists()) {
            log.warn { "Query engine: no $dbConfigFile, organism $organism will not be queryable" }
            return@mapNotNull null
        }
        val dbConfig = SiloConfigReader.readDatabaseConfig(dbConfigFile)
        val lineageSystems = dbConfig.schema.metadata.mapNotNull { it.generateLineageIndex }.toSet()
        val lineages: Map<String, LineageDefinition> = lineageSystems.associateWith { system ->
            val file = File(dir, "$system.yaml")
            if (file.exists()) {
                SiloConfigReader.readLineageDefinition(file.readText())
            } else {
                log.warn { "Query engine: lineage definition $file missing for $organism" }
                LineageDefinition(emptyMap())
            }
        }
        organism to QuerySchema.build(organism, dbConfig, instanceConfig.referenceGenome, lineages)
    }.toMap()

    fun get(organism: String): QuerySchema? = schemas[organism]
}
