package org.loculus.backend.query.index

import mu.KotlinLogging
import org.loculus.backend.query.QueryEngineProperties
import org.loculus.backend.query.QuerySchemaRegistry
import org.loculus.backend.query.projection.REBUILDING_MARKER
import org.loculus.backend.query.schema.QuerySchema
import org.springframework.beans.factory.DisposableBean
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component
import java.sql.Connection
import java.time.Instant
import java.util.TreeSet
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.locks.ReentrantLock
import javax.sql.DataSource
import kotlin.concurrent.withLock

private val log = KotlinLogging.logger {}

/**
 * Maintains one [InMemoryOrganismIndex] per queryable organism: a full load from the projection tables
 * (in background threads after application start), then tailing `query_changelog` every
 * `loculus.query-engine.tail-interval-ms`. Large change batches (e.g. a projection rebuild) trigger a full
 * reload, once the rebuild that writes them has finished. Reloads run one organism at a time and drop the old index
 * first, so the heap holds at most one index copy being rebuilt. The first loads at startup run concurrently. A failed
 * load is retried with exponential backoff; the retry of a failed reload is a reload too.
 *
 * While an organism's index is being (re)loaded, [forRequest] waits for it up to `loculus.query-engine.reload-wait-ms`
 * (slow answers instead of 503s), and answers 503 on timeout, or at once when the load failed.
 *
 * Two guards against serving a stale index: a changelog that ends below the seq already applied (it was truncated or
 * restored) triggers a reload, and an organism whose tail has failed without a break for longer than
 * `loculus.query-engine.stale-after-tail-failure-ms` answers 503 until the tail succeeds again (the index is kept,
 * so recovery is immediate). Shorter failures are invisible to requests.
 */
@Component
@ConditionalOnProperty(prefix = "loculus.query-engine", name = ["enabled"], havingValue = "true")
class QueryIndexService(
    private val registry: QuerySchemaRegistry,
    private val dataSource: DataSource,
    private val properties: QueryEngineProperties,
) : OrganismIndexProvider,
    DisposableBean {
    private val indexes = ConcurrentHashMap<String, InMemoryOrganismIndex>()
    private val loadedOnce: MutableSet<String> = ConcurrentHashMap.newKeySet()

    /**
     * per organism, the outcome of its current or last load: pending while it runs (or waits for [reloadLock]),
     * completed with the index it loaded, or exceptionally with a [LoadFailed] until the next attempt starts. A new
     * pending future is installed before the organism's index is dropped, so a request that finds no index finds
     * the future of the load that will replace it.
     */
    private val loads = ConcurrentHashMap<String, CompletableFuture<OrganismIndex>>().apply {
        registry.schemas.keys.forEach { put(it, CompletableFuture()) }
    }

    /**
     * reloads (and retries of failed reloads) run one organism at a time; an organism waiting for its turn keeps
     * serving its old index
     */
    internal val reloadLock = ReentrantLock()
    private val executor = Executors.newScheduledThreadPool(maxOf(1, registry.schemas.size)) { runnable ->
        Thread(runnable, "query-index").apply { isDaemon = true }
    }

    override fun get(organism: String): OrganismIndex? = indexes[organism]

    /** per organism, since when its tail has failed without a break (absent while it works) */
    private val tailFailingSince = ConcurrentHashMap<String, Long>()

    override fun forRequest(organism: String): IndexLookup {
        indexes[organism]?.let { index ->
            val since = tailFailingSince[organism]
            if (since != null && System.currentTimeMillis() - since > properties.staleAfterTailFailureMs) {
                return IndexLookup.Unavailable(
                    "The query engine for $organism is not available: its index cannot be updated from the " +
                        "database (since ${Instant.ofEpochMilli(since)}). Please try again later.",
                )
            }
            return IndexLookup.Ready(index)
        }
        val load = loads[organism] ?: return IndexLookup.Unavailable("The query engine for $organism is not available.")
        val what = if (organism in loadedOnce) "being reloaded" else "still loading"
        val started = System.nanoTime()
        fun waitedMs() = (System.nanoTime() - started) / 1_000_000
        return try {
            val index = load.get(properties.reloadWaitMs, TimeUnit.MILLISECONDS)
            val waited = waitedMs()
            if (waited > SLOW_WAIT_LOG_MS) log.info { "Query index for $organism: a request waited $waited ms for it" }
            IndexLookup.Ready(index)
        } catch (_: TimeoutException) {
            log.warn { "Query index for $organism: a request gave up after ${waitedMs()} ms waiting for it (503)" }
            IndexLookup.Unavailable(
                "The query engine for $organism is not available: its index is $what. Please try again later.",
            )
        } catch (e: ExecutionException) {
            IndexLookup.Unavailable(e.cause?.message ?: "The query engine for $organism is not available.")
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            IndexLookup.Unavailable("The query engine for $organism is not available: the request was interrupted.")
        }
    }

    /** organisms whose index has not finished its first load */
    fun organismsNotLoaded(): List<String> = registry.schemas.keys.filter { it !in loadedOnce }

    @EventListener(ApplicationReadyEvent::class)
    fun start() {
        registry.schemas.forEach { (organism, schema) ->
            val tracker = OrganismTracker(organism, schema)
            executor.scheduleWithFixedDelay(tracker::tick, 0, properties.tailIntervalMs, TimeUnit.MILLISECONDS)
        }
    }

    override fun destroy() {
        executor.shutdownNow()
    }

    private inner class OrganismTracker(private val organism: String, schema: QuerySchema) {
        private val reader = ProjectionReader(schema)
        private val schemaRef = schema
        private var index: InMemoryOrganismIndex? = null

        /** every changelog entry with seq <= safeSeq has been applied */
        private var safeSeq = 0L

        /** applied changelog seqs above [safeSeq] (non-empty only while there are gaps) */
        private val appliedAbove = TreeSet<Long>()
        private var gapSeq = -1L
        private var gapSince = 0L

        /** the sustained tail failure (see [tailFailingSince]) has been logged */
        private var staleWarned = false

        /** a large backlog is waiting for the projection rebuild that writes it to finish */
        private var reloadDeferred = false

        /** consecutive failed loads, and when the next load may start */
        private var loadFailures = 0
        private var nextLoadAt = 0L

        /**
         * Must not throw: scheduleWithFixedDelay silently cancels every later run once a task throws, which would
         * freeze this organism's index. That includes OutOfMemoryError: a heap OOM never gets here (the deployment
         * runs with -XX:+ExitOnOutOfMemoryError, which exits at the failed allocation), and one thrown by library
         * code (e.g. an array above the VM's size limit) allocated nothing, so it is retried like any other error.
         */
        fun tick() {
            try {
                if (index == null) {
                    if (System.currentTimeMillis() < nextLoadAt) return
                    beginLoad()
                    // a load after the first one retries a failed reload: it waits its turn like any reload
                    if (organism in loadedOnce) reloadLock.withLock { load() } else load()
                } else if (tailTracked() == TailResult.RELOAD) {
                    reloadLock.withLock {
                        beginLoad()
                        indexes.remove(organism)
                        index = null
                        load()
                    }
                }
            } catch (e: Throwable) {
                val wait = (nextLoadAt - System.currentTimeMillis()) / 1000
                val retry = if (index == null) ", next load in $wait s" else ""
                log.error(e) { "Query index for $organism: update failed$retry" }
            }
        }

        /** [tail], recording in [tailFailingSince] whether it fails */
        private fun tailTracked(): TailResult {
            val result = try {
                tail()
            } catch (e: Throwable) {
                val now = System.currentTimeMillis()
                val since = tailFailingSince.computeIfAbsent(organism) { now }
                if (!staleWarned && now - since > properties.staleAfterTailFailureMs) {
                    staleWarned = true
                    log.warn {
                        "Query index for $organism: updates have failed for ${(now - since) / 1000} s, " +
                            "requests get 503 until they succeed again"
                    }
                }
                throw e
            }
            tailRecovered()
            return result
        }

        private fun tailRecovered() {
            val since = tailFailingSince.remove(organism) ?: return
            if (staleWarned) {
                log.info {
                    "Query index for $organism: updates work again after " +
                        "${(System.currentTimeMillis() - since) / 1000} s, serving requests again"
                }
            }
            staleWarned = false
        }

        /** requests that find no index from now on wait for the next load's outcome (called before the drop) */
        private fun beginLoad() {
            loads.compute(organism) { _, current ->
                if (current == null ||
                    current.isDone
                ) {
                    CompletableFuture()
                } else {
                    current
                }
            }
        }

        /**
         * [fullLoad]; after a failure, the next load waits [MIN_LOAD_BACKOFF_MS] doubling to [MAX_LOAD_BACKOFF_MS].
         * Either way, requests waiting for the load are released.
         */
        private fun load() {
            try {
                fullLoad()
                loadFailures = 0
                loads[organism]!!.complete(index!!)
            } catch (e: Throwable) {
                nextLoadAt = System.currentTimeMillis() +
                    minOf(MAX_LOAD_BACKOFF_MS, MIN_LOAD_BACKOFF_MS shl minOf(loadFailures, 20))
                loadFailures++
                loads[organism]!!.completeExceptionally(
                    LoadFailed(
                        "The query engine for $organism is not available: loading its index failed and is retried " +
                            "in the background. Please try again later.",
                    ),
                )
                throw e
            }
        }

        private fun fullLoad() {
            val started = System.currentTimeMillis()
            val (startSeq, maxId, version) = dataSource.connection.use { connection ->
                Triple(maxChangelogSeq(connection), maxId(connection), dataVersion(connection))
            }
            val loaded = IndexLoader.load(
                schemaRef,
                maxId,
                readRange = { from, to, consumer ->
                    dataSource.connection.use { connection ->
                        connection.autoCommit = false
                        try {
                            reader.streamRange(connection, from, to, consumer = consumer)
                        } finally {
                            connection.rollback()
                        }
                    }
                },
                dataVersion = version,
                readers = LOAD_READERS,
            )
            loaded.rowLoader = { ids -> dataSource.connection.use { reader.readIds(it, ids) } }
            index = loaded
            indexes[organism] = loaded
            loadedOnce.add(organism)
            tailRecovered()
            safeSeq = startSeq
            appliedAbove.clear()
            gapSeq = -1
            log.info {
                "Query index for $organism: loaded ${loaded.size} entries in " +
                    "${System.currentTimeMillis() - started} ms (~${loaded.memoryUsage().values.sum() / 1_000_000} MB)"
            }
        }

        /** applies the next changelog batch, or asks for a reload (called without holding the old index) */
        private fun tail(): TailResult {
            val current = index ?: return TailResult.APPLIED
            dataSource.connection.use { connection ->
                connection.autoCommit = true
                val changes = changelogAfter(connection, safeSeq, REBUILD_MIN_CHANGES + 1)
                if (changes.isEmpty()) {
                    // seqs only grow (nothing deletes an organism's newest row), so this means the changelog was
                    // truncated or restored and later seqs may be reused: the index cannot be kept in sync
                    val latest = latestChangelogSeq(connection)
                    if (latest != null && latest < safeSeq) {
                        log.warn {
                            "Query index for $organism: query_changelog ends at seq $latest, below the $safeSeq " +
                                "already applied; reloading"
                        }
                        return TailResult.RELOAD
                    }
                }
                val newChanges = changes.filter { it.first !in appliedAbove }
                if (newChanges.isEmpty()) {
                    advanceSafeSeq(changes.map { it.first })
                    return TailResult.APPLIED
                }
                val ids = newChanges.map { it.second }.toSet()
                if (changes.size > REBUILD_MIN_CHANGES) {
                    // a projection rebuild writes changelog rows throughout: serve the current index until it is
                    // done and reload once then, instead of reloading (a 503 window) again and again during it
                    if (rebuilding(connection)) {
                        if (!reloadDeferred) log.info { "Query index for $organism: reload waits for the rebuild" }
                        reloadDeferred = true
                        return TailResult.APPLIED
                    }
                    reloadDeferred = false
                    val pending = pendingIds(connection, safeSeq)
                    if (pending > current.size * REBUILD_FRACTION) {
                        log.info { "Query index for $organism: $pending changed entries, reloading" }
                        return TailResult.RELOAD
                    }
                }
                val rows = reader.readIds(connection, ids)
                val found = rows.map { it.id }.toSet()
                current.apply(rows, ids.filter { it !in found }, dataVersion(connection))
                newChanges.forEach { appliedAbove.add(it.first) }
                advanceSafeSeq(changes.map { it.first })
                return TailResult.APPLIED
            }
        }

        /**
         * safeSeq only advances over contiguous seqs; a gap is skipped once it persisted for [GAP_TIMEOUT_MS].
         * Since V1.39 the projector assigns per-organism seqs in commit order without holes, so gaps only occur in
         * rows written before (global bigserial seqs, interleaved across organisms and assigned before commit).
         */
        private fun advanceSafeSeq(seen: List<Long>) {
            val all = TreeSet(seen)
            all.addAll(appliedAbove)
            while (true) {
                while (all.contains(safeSeq + 1)) safeSeq++
                val next = all.higher(safeSeq) ?: break
                val now = System.currentTimeMillis()
                if (gapSeq != safeSeq + 1) {
                    gapSeq = safeSeq + 1
                    gapSince = now
                    break
                }
                if (now - gapSince < GAP_TIMEOUT_MS) break
                safeSeq = next - 1
            }
            appliedAbove.headSet(safeSeq, true).clear()
        }

        private fun changelogAfter(connection: Connection, after: Long, limit: Int): List<Pair<Long, Int>> =
            connection.prepareStatement(
                "select seq, id from query_changelog where organism = ? and seq > ? order by seq limit ?",
            ).use { statement ->
                statement.setString(1, organism)
                statement.setLong(2, after)
                statement.setInt(3, limit)
                statement.executeQuery().use { rs ->
                    val result = ArrayList<Pair<Long, Int>>()
                    while (rs.next()) result.add(rs.getLong(1) to rs.getInt(2))
                    result
                }
            }

        private fun pendingIds(connection: Connection, after: Long): Long = connection.prepareStatement(
            "select count(distinct id) from query_changelog where organism = ? and seq > ?",
        ).use { statement ->
            statement.setString(1, organism)
            statement.setLong(2, after)
            statement.executeQuery().use { rs -> if (rs.next()) rs.getLong(1) else 0 }
        }

        private fun maxChangelogSeq(connection: Connection): Long = connection.prepareStatement(
            "select coalesce(max(seq), 0) from query_changelog where organism = ?",
        ).use { statement ->
            statement.setString(1, organism)
            statement.executeQuery().use { rs -> if (rs.next()) rs.getLong(1) else 0 }
        }

        /** null if the query returns no row (only with a fake DataSource: max() always returns one) */
        private fun latestChangelogSeq(connection: Connection): Long? = connection.prepareStatement(
            "select max(seq) from query_changelog where organism = ?",
        ).use { statement ->
            statement.setString(1, organism)
            statement.executeQuery().use { rs ->
                if (rs.next()) rs.getLong(1).takeUnless { rs.wasNull() } ?: 0 else null
            }
        }

        private fun maxId(connection: Connection): Int = connection.prepareStatement(
            "select coalesce(max(id), 0) from query_entries where organism = ?",
        ).use { statement ->
            statement.setString(1, organism)
            statement.executeQuery().use { rs -> if (rs.next()) rs.getInt(1) else 0 }
        }

        private fun rebuilding(connection: Connection): Boolean = connection.prepareStatement(
            "select encoding_hash = ? from query_engine_state where organism = ?",
        ).use { statement ->
            statement.setString(1, REBUILDING_MARKER)
            statement.setString(2, organism)
            statement.executeQuery().use { rs -> rs.next() && rs.getBoolean(1) }
        }

        private fun dataVersion(connection: Connection): Long = connection.prepareStatement(
            "select data_version from query_engine_state where organism = ?",
        ).use { statement ->
            statement.setString(1, organism)
            statement.executeQuery().use { rs -> if (rs.next()) rs.getLong(1) else 0 }
        }
    }

    private enum class TailResult { APPLIED, RELOAD }

    /** the outcome of a failed load that waiting requests see; its message is the 503's */
    private class LoadFailed(message: String) : Exception(message)

    companion object {
        /** a batch larger than max(this, REBUILD_FRACTION * size) triggers a full reload */
        const val REBUILD_MIN_CHANGES = 50_000
        const val REBUILD_FRACTION = 0.1
        const val GAP_TIMEOUT_MS = 10_000L
        const val MIN_LOAD_BACKOFF_MS = 1_000L
        const val MAX_LOAD_BACKOFF_MS = 300_000L

        /** requests that waited longer than this for a (re)load are logged */
        const val SLOW_WAIT_LOG_MS = 1_000L

        /** parallel reader connections during a full load (the Hikari pool defaults to 30) */
        const val LOAD_READERS = 4
    }
}
