package org.loculus.backend.query.lineage

import com.fasterxml.jackson.databind.ObjectMapper
import mu.KotlinLogging
import org.loculus.backend.query.QueryEngineProperties
import org.loculus.backend.query.QuerySchemaRegistry
import org.loculus.backend.query.filter.True
import org.loculus.backend.query.index.OrganismIndex
import org.loculus.backend.query.index.OrganismIndexProvider
import org.loculus.backend.query.schema.LineageDefinitionReader
import org.loculus.backend.query.schema.QuerySchema
import org.springframework.beans.factory.DisposableBean
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

private val log = KotlinLogging.logger {}

/** Where lineage definitions come from; an interface so tests can do without HTTP. */
interface LineageSource {
    /** a lineage definition file (lineage systems) */
    fun download(url: String): String

    /** the lineage definition spanning [values] (hierarchical fields), as the SILO importer requests it */
    fun hierarchy(serviceUrl: String, values: List<String>): String
}

class HttpLineageSource(
    // HTTP/2 would send an h2c Upgrade on http://, which uvicorn (the taxonomy service) rejects with a 400
    private val client: HttpClient = HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_1_1)
        .connectTimeout(Duration.ofSeconds(10))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build(),
) : LineageSource {
    private val objectMapper = ObjectMapper()

    override fun download(url: String): String = send(HttpRequest.newBuilder(URI.create(url)).GET())

    /**
     * `POST <serviceUrl>/silo-lineage {"values": [...]}`, retried with `prune=true` when the service answers 413
     * (the unpruned spanning tree is over its size limit), like `loculus-silo/src/silo_import/lineage.py`.
     */
    override fun hierarchy(serviceUrl: String, values: List<String>): String {
        val body = objectMapper.writeValueAsString(mapOf("values" to values))
        val base = "${serviceUrl.trimEnd('/')}/silo-lineage"
        fun request(url: String) = HttpRequest.newBuilder(URI.create(url))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
        val response = client.send(request(base).timeout(TIMEOUT).build(), HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() == 413) {
            log.warn { "Unpruned hierarchy from $base exceeds the service's size limit; retrying with prune=true" }
            return send(request("$base?prune=true"))
        }
        return checked(base, response)
    }

    private fun send(builder: HttpRequest.Builder): String {
        val request = builder.timeout(TIMEOUT).build()
        return checked(request.uri().toString(), client.send(request, HttpResponse.BodyHandlers.ofString()))
    }

    private fun checked(url: String, response: HttpResponse<String>): String {
        check(response.statusCode() in 200..299) {
            "$url answered ${response.statusCode()}: ${response.body().take(500)}"
        }
        return response.body()
    }

    private companion object {
        val TIMEOUT: Duration = Duration.ofSeconds(60)
    }
}

/**
 * Supplies the lineage definitions that [QuerySchema] starts without, in memory on each replica:
 * - a lineage system's definition file is downloaded once, for the highest configured pipeline version;
 * - a hierarchical field's definition (e.g. `hostTaxonId` from the taxonomy service) is rebuilt from the field's
 *   distinct values in the organism's index whenever that set changes, as the SILO importer does at each import.
 *   Its nodes are the observed values plus their ancestors, so "this taxon or any descendant" is lineage
 *   expansion over it.
 *
 * Not thread-safe: [refresh] runs on one thread. Failures are retried with exponential backoff.
 */
class LineageDefinitions(
    private val schemas: Map<String, QuerySchema>,
    private val lineageSystemUrls: Map<String, Map<String, Map<Int, String>>>,
    private val indexProvider: OrganismIndexProvider,
    private val source: LineageSource,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private class Attempts {
        var failures = 0
        var nextAttemptAt = 0L

        fun due(now: Long) = now >= nextAttemptAt

        fun failed(now: Long) {
            nextAttemptAt = now + minOf(MAX_BACKOFF_MS, MIN_BACKOFF_MS shl minOf(failures, 20))
            failures++
        }

        fun succeeded() {
            failures = 0
            nextAttemptAt = 0
        }
    }

    private class Hierarchy(val schema: QuerySchema, val field: String, val serviceUrl: String) {
        val attempts = Attempts()
        var checkedIndex: OrganismIndex? = null
        var checkedDataVersion = -1L
        var values: Set<String>? = null
    }

    private class Download(val schema: QuerySchema, val system: String, val url: String) {
        val attempts = Attempts()
    }

    private val pendingDownloads: MutableList<Download> = schemas.values.flatMap { schema ->
        lineageSystemUrls[schema.organism].orEmpty().mapNotNull { (system, byVersion) ->
            val latest = byVersion.maxByOrNull { it.key } ?: return@mapNotNull null
            Download(schema, system, latest.value)
        }
    }.toMutableList()

    private val hierarchies = schemas.values.flatMap { schema ->
        schema.metadata.mapNotNull { field ->
            field.hierarchicalFilter?.let { Hierarchy(schema, field.name, it) }
        }
    }

    fun refresh() {
        val now = clock()
        pendingDownloads.removeAll { download -> download.attempts.due(now) && download(download, now) }
        hierarchies.forEach { if (it.attempts.due(now)) refreshHierarchy(it, now) }
    }

    private fun download(download: Download, now: Long): Boolean {
        val organism = download.schema.organism
        return try {
            val definition = LineageDefinitionReader.read(source.download(download.url))
            download.schema.updateLineageDefinition(download.system, definition)
            log.info { "Query engine: loaded lineage system ${download.system} for $organism from ${download.url}" }
            true
        } catch (e: Exception) {
            download.attempts.failed(now)
            log.error(e) { "Query engine: downloading lineage system ${download.system} for $organism failed" }
            false
        }
    }

    private fun refreshHierarchy(hierarchy: Hierarchy, now: Long) {
        val index = indexProvider.get(hierarchy.schema.organism) ?: return
        if (index === hierarchy.checkedIndex && index.dataVersion == hierarchy.checkedDataVersion) return
        val dataVersion = index.dataVersion
        val values = index.aggregate(index.evaluate(True), listOf(hierarchy.field))
            .mapNotNullTo(sortedSetOf()) { it.values.single()?.toString() }
        if (values != hierarchy.values) {
            try {
                val definition = if (values.isEmpty()) {
                    LineageDefinitionReader.read("{}")
                } else {
                    LineageDefinitionReader.read(source.hierarchy(hierarchy.serviceUrl, values.toList()))
                }
                hierarchy.schema.updateLineageDefinition(hierarchy.field, definition)
                hierarchy.values = values
                hierarchy.attempts.succeeded()
                log.info {
                    "Query engine: ${hierarchy.field} hierarchy for ${hierarchy.schema.organism} rebuilt from " +
                        "${values.size} values (${definition.nodes.size} nodes)"
                }
            } catch (e: Exception) {
                hierarchy.attempts.failed(now)
                log.error(e) {
                    "Query engine: fetching the ${hierarchy.field} hierarchy for ${hierarchy.schema.organism} " +
                        "from ${hierarchy.serviceUrl} failed"
                }
                return
            }
        }
        hierarchy.checkedIndex = index
        hierarchy.checkedDataVersion = dataVersion
    }

    private companion object {
        const val MIN_BACKOFF_MS = 5_000L
        const val MAX_BACKOFF_MS = 300_000L
    }
}

/** Runs [LineageDefinitions.refresh] every `loculus.query-engine.lineage-refresh-interval-ms`. */
@Component
@ConditionalOnProperty(prefix = "loculus.query-engine", name = ["enabled"], havingValue = "true")
class LineageDefinitionUpdater(
    registry: QuerySchemaRegistry,
    indexProvider: OrganismIndexProvider,
    private val properties: QueryEngineProperties,
) : DisposableBean {
    private val definitions =
        LineageDefinitions(registry.schemas, registry.lineageSystemUrls, indexProvider, HttpLineageSource())
    private val executor = Executors.newSingleThreadScheduledExecutor { runnable ->
        Thread(runnable, "query-lineages").apply { isDaemon = true }
    }

    @EventListener(ApplicationReadyEvent::class)
    fun start() {
        executor.scheduleWithFixedDelay(::refresh, 0, properties.lineageRefreshIntervalMs, TimeUnit.MILLISECONDS)
    }

    /** must not throw: scheduleWithFixedDelay cancels every later run once a task throws */
    private fun refresh() {
        try {
            definitions.refresh()
        } catch (e: Throwable) {
            log.error(e) { "Query engine: lineage refresh failed" }
        }
    }

    override fun destroy() {
        executor.shutdownNow()
    }
}
