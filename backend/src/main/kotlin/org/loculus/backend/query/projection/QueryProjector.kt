package org.loculus.backend.query.projection

import com.fasterxml.jackson.databind.ObjectMapper
import mu.KotlinLogging
import org.jetbrains.exposed.v1.jdbc.transactions.TransactionManager
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.loculus.backend.api.Organism
import org.loculus.backend.model.ReleasedDataModel
import org.loculus.backend.model.ReleasedDataWithCompressedSequences
import org.loculus.backend.query.QueryEngineProperties
import org.loculus.backend.query.QuerySchemaRegistry
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.service.submission.CompressionDictService
import org.loculus.backend.utils.DateProvider
import org.springframework.beans.factory.DisposableBean
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.sql.Connection
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Semaphore
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.locks.ReentrantLock
import javax.sql.DataSource
import kotlin.concurrent.withLock

private val log = KotlinLogging.logger {}

/** pg advisory lock key held by the (single) projector leader: "loculus-query-projector".hashCode() */
private const val ADVISORY_LOCK_KEY = 0x6c71_7072L

/** encoding_hash while a full rebuild is in progress (never equals a real hash, so a crash re-triggers the rebuild) */
private const val REBUILDING_MARKER = "rebuilding"

private const val MAX_DRAIN_MILLIS_PER_ORGANISM = 10_000L
private const val REBUILD_RETRY_BACKOFF_MILLIS = 60_000L
private const val PARALLEL_THRESHOLD = 256
private const val REBUILD_CHUNK_SIZE = 1000

/** parallel write transactions (= database connections) during a full rebuild */
private const val REBUILD_WRITERS = 4

/**
 * Maintains the query engine projection (query_entries, query_mutation_data, query_sequences) of the released data.
 *
 * Liveness: triggers on the source tables (V1.36) put the affected accessions into query_dirty_accessions (or
 * set query_engine_state.needs_full_rebuild on a pipeline version change). Every
 * `loculus.query-engine.projector-interval-ms` the projector
 * - checks once per (UTC) day whether RESTRICTED data use terms have lapsed and marks those accessions dirty,
 * - per organism: runs a full rebuild if needed (new organism, changed sequence encoding, changed metadata field
 *   list, pipeline version change), then drains the dirty queue in batches: all released versions of each claimed
 *   accession are recomputed with the same code as get-released-data and written; the claimed queue rows are
 *   deleted in the same transaction.
 * Every changed or deleted id is appended to query_changelog in the transaction that changes it.
 *
 * Only one backend replica runs the projector: it holds a session level Postgres advisory lock on a dedicated
 * connection.
 */
@Component
@ConditionalOnProperty(prefix = "loculus.query-engine", name = ["enabled"], havingValue = "true")
class QueryProjector(
    private val registry: QuerySchemaRegistry,
    private val properties: QueryEngineProperties,
    private val releasedDataModel: ReleasedDataModel,
    compressionDictService: CompressionDictService,
    private val dateProvider: DateProvider,
    private val objectMapper: ObjectMapper,
    private val dataSource: DataSource,
) : DisposableBean {
    private val tickLock = ReentrantLock()
    private var leaderConnection: Connection? = null
    private var lastRestrictionCheckDate: String? = null
    private val rebuildFailedAt = HashMap<String, Long>()

    private val workerCount = maxOf(1, Runtime.getRuntime().availableProcessors() - 1)
    private val workers: ExecutorService = Executors.newFixedThreadPool(workerCount, daemonThreads("query-projector"))
    private val writerExecutor: ExecutorService =
        Executors.newFixedThreadPool(REBUILD_WRITERS, daemonThreads("query-projector-writer"))

    private val decompressor = SequenceDecompressor { compressionDictService.getDictById(it) }
    private val entryProjectors = HashMap<String, EntryProjector>()
    private val writers = HashMap<String, ProjectionWriter>()

    @Scheduled(
        fixedDelayString = "\${loculus.query-engine.projector-interval-ms:500}",
        initialDelayString = "\${loculus.query-engine.projector-initial-delay-ms:1000}",
    )
    fun scheduledRun() {
        try {
            runOnce()
        } catch (e: Exception) {
            log.error(e) { "Query projector run failed: $e" }
        }
    }

    /**
     * Runs one projector iteration if this replica is (or becomes) the projector leader.
     * @return false if another replica holds the projector lock
     */
    fun runOnce(): Boolean = tickLock.withLock {
        if (!ensureLeadership()) return false
        checkLapsedDataUseTerms()
        for (schema in registry.schemas.values) {
            processOrganism(schema)
        }
        true
    }

    /** forces the lapsed data use terms check to run again in the next iteration (for tests) */
    internal fun resetDataUseTermsCheck() = tickLock.withLock { lastRestrictionCheckDate = null }

    override fun destroy() {
        tickLock.withLock {
            releaseLeadership()
        }
        workers.shutdownNow()
        writerExecutor.shutdownNow()
    }

    // ------------------------------------------------------------------------------------------------------------
    // leadership

    private fun ensureLeadership(): Boolean {
        leaderConnection?.let { connection ->
            if (runCatching { connection.isValid(5) }.getOrDefault(false)) return true
            log.warn { "Query projector lost its lock connection, trying to re-acquire the projector lock" }
            releaseLeadership()
        }
        val connection = dataSource.connection
        connection.autoCommit = true
        val acquired = try {
            connection.prepareStatement("select pg_try_advisory_lock(?)").use {
                it.setLong(1, ADVISORY_LOCK_KEY)
                it.executeQuery().use { rs -> rs.next() && rs.getBoolean(1) }
            }
        } catch (e: Exception) {
            connection.close()
            throw e
        }
        if (!acquired) {
            connection.close()
            return false
        }
        log.info { "This backend replica is now the query projector leader" }
        leaderConnection = connection
        return true
    }

    private fun releaseLeadership() {
        val connection = leaderConnection ?: return
        leaderConnection = null
        runCatching {
            connection.prepareStatement("select pg_advisory_unlock(?)").use {
                it.setLong(1, ADVISORY_LOCK_KEY)
                it.execute()
            }
        }
        runCatching { connection.close() }
    }

    // ------------------------------------------------------------------------------------------------------------
    // per organism

    private fun processOrganism(schema: QuerySchema) {
        val organism = schema.organism
        val rebuildReason = rebuildReason(schema)
        if (rebuildReason != null) {
            val failedAt = rebuildFailedAt[organism]
            if (failedAt != null && System.currentTimeMillis() - failedAt < REBUILD_RETRY_BACKOFF_MILLIS) return
            try {
                fullRebuild(schema, rebuildReason)
                rebuildFailedAt.remove(organism)
            } catch (e: Exception) {
                rebuildFailedAt[organism] = System.currentTimeMillis()
                log.error(e) { "Query projection: full rebuild of $organism failed, will retry: $e" }
                return
            }
        }
        drainDirtyAccessions(schema)
    }

    private fun rebuildReason(schema: QuerySchema): String? = transaction {
        val connection = jdbc()
        connection.prepareStatement(
            "insert into query_engine_state (organism, encoding_hash) values (?, '') on conflict do nothing",
        ).use {
            it.setString(1, schema.organism)
            it.executeUpdate()
        }
        val (encodingHash, needsFullRebuild) = connection.prepareStatement(
            "select encoding_hash, needs_full_rebuild from query_engine_state where organism = ?",
        ).use {
            it.setString(1, schema.organism)
            it.executeQuery().use { rs ->
                rs.next()
                rs.getString(1) to rs.getBoolean(2)
            }
        }
        when {
            needsFullRebuild -> "full rebuild requested"

            encodingHash != schema.encodingHash() -> "encoding changed ('$encodingHash' -> '${schema.encodingHash()}')"

            else -> {
                val storedFields = connection.prepareStatement(
                    "select metadata from query_entries where organism = ? limit 1",
                ).use {
                    it.setString(1, schema.organism)
                    it.executeQuery().use { rs ->
                        if (rs.next()) {
                            objectMapper.readTree(
                                rs.getString(1),
                            ).fieldNames().asSequence().toSet()
                        } else {
                            null
                        }
                    }
                }
                val schemaFields = schema.metadata.map { it.name }.toSet()
                if (storedFields != null && storedFields != schemaFields) "metadata fields changed" else null
            }
        }
    }

    private fun entryProjector(schema: QuerySchema) =
        entryProjectors.getOrPut(schema.organism) { EntryProjector(schema, decompressor, objectMapper) }

    private fun writer(schema: QuerySchema) = writers.getOrPut(schema.organism) { ProjectionWriter(schema) }

    // ------------------------------------------------------------------------------------------------------------
    // incremental

    private fun drainDirtyAccessions(schema: QuerySchema) {
        val start = System.currentTimeMillis()
        var accessions = 0
        var changed = 0
        while (System.currentTimeMillis() - start < MAX_DRAIN_MILLIS_PER_ORGANISM) {
            val result = try {
                processDirtyBatch(schema, properties.projectorBatchSize)
            } catch (e: Exception) {
                log.error(e) { "Query projection: batch of dirty accessions of ${schema.organism} failed: $e" }
                processDirtyAccessionsOneByOne(schema, properties.projectorBatchSize)
            }
            if (result.first == 0) break
            accessions += result.first
            changed += result.second
        }
        if (accessions > 0) {
            log.info {
                "Query projection: processed $accessions dirty accessions of ${schema.organism}, " +
                    "$changed entries changed, took ${System.currentTimeMillis() - start} ms"
            }
        }
    }

    /**
     * Claims (deletes) up to [limit] dirty accessions (or only [accession] if given) and recomputes them, all in one
     * transaction.
     * @return (claimed accessions, changed ids)
     */
    private fun processDirtyBatch(schema: QuerySchema, limit: Int, accession: String? = null): Pair<Int, Int> =
        transaction {
            val connection = jdbc()
            val accessions = claimDirtyAccessions(connection, schema.organism, limit, accession)
            if (accessions.isEmpty()) return@transaction 0 to 0
            accessions.size to recomputeAccessions(connection, schema, accessions)
        }

    /** fallback after a failed batch: process accessions separately, dropping (and logging) the failing ones */
    private fun processDirtyAccessionsOneByOne(schema: QuerySchema, limit: Int): Pair<Int, Int> {
        val candidates = transaction {
            jdbc().prepareStatement("select accession from query_dirty_accessions where organism = ? limit ?").use {
                it.setString(1, schema.organism)
                it.setInt(2, limit)
                it.executeQuery().use { rs ->
                    val result = ArrayList<String>()
                    while (rs.next()) result.add(rs.getString(1))
                    result
                }
            }
        }
        var processed = 0
        var changed = 0
        for (accession in candidates) {
            try {
                val (n, c) = processDirtyBatch(schema, 1, accession)
                processed += n
                changed += c
            } catch (e: Exception) {
                transaction { claimDirtyAccessions(jdbc(), schema.organism, 1, accession) }
                log.error(e) {
                    "Query projection: cannot project accession $accession of ${schema.organism}, " +
                        "its projection stays stale until it changes again: $e"
                }
                processed++
            }
        }
        return processed to changed
    }

    private fun claimDirtyAccessions(
        connection: Connection,
        organism: String,
        limit: Int,
        accession: String? = null,
    ): List<String> = connection.prepareStatement(
        // Lock exactly the claimed rows (by ctid) and keep the limit a literal: with a bind parameter, the generic
        // plan Postgres switches to after a few executions may lock (almost) the whole queue before limiting,
        // which took > 10 minutes for a queue of 1M accessions.
        """
        with claimed as (
            select ctid from query_dirty_accessions
            where organism = ? and (?::text is null or accession = ?::text)
            limit ${limit.coerceAtLeast(1)}
            for update skip locked
        )
        delete from query_dirty_accessions d
        using claimed
        where d.ctid = claimed.ctid
        returning d.accession
        """.trimIndent(),
    ).use {
        it.setString(1, organism)
        it.setString(2, accession)
        it.setString(3, accession)
        it.executeQuery().use { rs ->
            val result = ArrayList<String>()
            while (rs.next()) result.add(rs.getString(1))
            result
        }
    }

    /** recomputes all released versions of [accessions]; must run inside the transaction of [connection] */
    private fun recomputeAccessions(connection: Connection, schema: QuerySchema, accessions: List<String>): Int {
        val entries = releasedDataModel
            .streamReleasedDataWithCompressedSequences(Organism(schema.organism), accessions)
            .toList()
        val projector = entryProjector(schema)
        val projected = if (entries.size >= PARALLEL_THRESHOLD) {
            entries.chunked(maxOf(1, entries.size / workerCount + 1))
                .map { chunk -> CompletableFuture.supplyAsync({ chunk.map(projector::project) }, workers) }
                .flatMap { it.join() }
        } else {
            entries.map(projector::project)
        }

        val existingIds = HashMap<String, Int>()
        connection.prepareStatement(
            "select accession_version, id from query_entries where organism = ? and accession = any(?)",
        ).use {
            it.setString(1, schema.organism)
            it.setArray(2, connection.createArrayOf("text", accessions.toTypedArray()))
            it.executeQuery().use { rs ->
                while (rs.next()) existingIds[rs.getString(1)] = rs.getInt(2)
            }
        }

        val identified = assignIds(connection, schema.organism, projected, existingIds)
        val keptIds = identified.map { it.id }.toSet()
        val deletedIds = existingIds.values.filter { it !in keptIds }
        return writer(schema).write(connection, identified, deletedIds)
    }

    private fun assignIds(
        connection: Connection,
        organism: String,
        projected: List<ProjectedEntry>,
        existingIds: Map<String, Int>,
    ): List<IdentifiedEntry> {
        val newCount = projected.count { it.accessionVersion !in existingIds }
        var nextId = if (newCount > 0) allocateIds(connection, organism, newCount) else 0
        return projected.map { entry ->
            val existing = existingIds[entry.accessionVersion]
            if (existing != null) IdentifiedEntry(existing, false, entry) else IdentifiedEntry(nextId++, true, entry)
        }
    }

    /** @return the first of [count] newly allocated consecutive ids */
    private fun allocateIds(connection: Connection, organism: String, count: Int): Int = connection.prepareStatement(
        "update query_engine_state set next_id = next_id + ? where organism = ? returning next_id",
    ).use {
        it.setInt(1, count)
        it.setString(2, organism)
        it.executeQuery().use { rs ->
            check(rs.next()) { "No query_engine_state for $organism" }
            rs.getInt(1) - count
        }
    }

    // ------------------------------------------------------------------------------------------------------------
    // full rebuild

    private fun fullRebuild(schema: QuerySchema, reason: String) {
        val organism = schema.organism
        val start = System.currentTimeMillis()
        log.info { "Query projection: full rebuild of $organism ($reason)" }

        val existingIds = transaction {
            val connection = jdbc()
            connection.prepareStatement(
                "update query_engine_state set encoding_hash = ?, needs_full_rebuild = false where organism = ?",
            ).use {
                it.setString(1, REBUILDING_MARKER)
                it.setString(2, organism)
                it.executeUpdate()
            }
            // everything changed before the rebuild snapshot is covered by the rebuild
            connection.prepareStatement("delete from query_dirty_accessions where organism = ?").use {
                it.setString(1, organism)
                it.executeUpdate()
            }
            val ids = HashMap<String, Int>()
            connection.prepareStatement("select accession_version, id from query_entries where organism = ?").use {
                it.setString(1, organism)
                it.fetchSize = 10_000
                it.executeQuery().use { rs ->
                    while (rs.next()) ids[rs.getString(1)] = rs.getInt(2)
                }
            }
            ids
        }
        // accessionVersions not (yet) seen in the stream
        val unseen = ConcurrentHashMap(existingIds)
        val projector = entryProjector(schema)
        val writer = writer(schema)
        val maxInFlight = workerCount + REBUILD_WRITERS
        val inFlight = Semaphore(maxInFlight)
        val failure = AtomicReference<Throwable?>(null)
        val written = AtomicInteger(0)
        val changed = AtomicInteger(0)
        var read = 0
        var lastLog = System.currentTimeMillis()

        try {
            streamRebuildBatches(organism) { chunk ->
                failure.get()?.let { throw IllegalStateException("Rebuild of $organism failed", it) }
                inFlight.acquire()
                read += chunk.size
                CompletableFuture
                    .supplyAsync({ chunk.map(projector::project) }, workers)
                    .thenAcceptAsync({ projected ->
                        // allocate ids in a separate short transaction so that parallel writers do not
                        // serialize on the query_engine_state row lock
                        val identified = transaction { assignIds(jdbc(), organism, projected, existingIds) }
                        val changedInBatch = transaction { writer.write(jdbc(), identified, emptyList()) }
                        projected.forEach { unseen.remove(it.accessionVersion) }
                        changed.addAndGet(changedInBatch)
                        written.addAndGet(projected.size)
                    }, writerExecutor)
                    .whenComplete { _, e ->
                        if (e != null) failure.compareAndSet(null, e)
                        inFlight.release()
                    }
                if (System.currentTimeMillis() - lastLog > 10_000) {
                    lastLog = System.currentTimeMillis()
                    val seconds = (lastLog - start) / 1000.0
                    log.info {
                        "Query projection: rebuilding $organism, read $read, written ${written.get()} entries " +
                            "(${(written.get() / seconds).toInt()} entries/s)"
                    }
                }
            }
        } finally {
            // wait until all batches are written (also on failure, so that no writes overlap with the next run)
            inFlight.acquire(maxInFlight)
            inFlight.release(maxInFlight)
        }
        failure.get()?.let { throw IllegalStateException("Rebuild of $organism failed", it) }

        val deleted = unseen.values.toList()
        deleted.chunked(10_000).forEach { ids ->
            transaction { changed.addAndGet(writer.write(jdbc(), emptyList(), ids)) }
        }
        transaction {
            jdbc().prepareStatement("update query_engine_state set encoding_hash = ? where organism = ?").use {
                it.setString(1, schema.encodingHash())
                it.setString(2, organism)
                it.executeUpdate()
            }
        }
        val seconds = (System.currentTimeMillis() - start) / 1000.0
        log.info {
            "Query projection: full rebuild of $organism done: ${written.get()} entries, ${deleted.size} deleted, " +
                "${changed.get()} changed, took ${"%.1f".format(seconds)} s " +
                "(${(written.get() / maxOf(seconds, 0.001)).toInt()} entries/s)"
        }
    }

    /** streams all released entries of [organism] in chunks, inside one read transaction */
    private fun streamRebuildBatches(organism: String, consumer: (List<ReleasedDataWithCompressedSequences>) -> Unit) =
        transaction {
            releasedDataModel.streamReleasedDataWithCompressedSequences(Organism(organism))
                .chunked(REBUILD_CHUNK_SIZE)
                .forEach(consumer)
        }

    // ------------------------------------------------------------------------------------------------------------
    // data use terms that lapse with time

    /**
     * dataUseTerms (and dataUseTermsRestrictedUntil, dataBecameOpenAt) depend on the current date: once a day, mark
     * all accessions dirty that are RESTRICTED in the projection but whose restriction has ended.
     */
    private fun checkLapsedDataUseTerms() {
        val today = dateProvider.getCurrentDate().toString()
        if (today == lastRestrictionCheckDate) return
        for (schema in registry.schemas.values) {
            if (schema.field("dataUseTerms") == null) continue
            val marked = transaction {
                jdbc().prepareStatement(
                    """
                    insert into query_dirty_accessions (organism, accession)
                    select distinct q.organism, q.accession
                    from query_entries q
                    where q.organism = ?
                        and q.metadata ->> 'dataUseTerms' = 'RESTRICTED'
                        and not exists (
                            select 1 from data_use_terms_table d
                            where d.accession = q.accession
                                and d.data_use_terms_type = 'RESTRICTED'
                                and d.restricted_until::date > ?::date
                                and d.change_date = (
                                    select max(d2.change_date) from data_use_terms_table d2
                                    where d2.accession = q.accession
                                )
                        )
                    on conflict do nothing
                    """.trimIndent(),
                ).use {
                    it.setString(1, schema.organism)
                    it.setString(2, today)
                    it.executeUpdate()
                }
            }
            if (marked > 0) {
                log.info { "Query projection: $marked accessions of ${schema.organism} are no longer RESTRICTED" }
            }
        }
        lastRestrictionCheckDate = today
    }

    private fun jdbc(): Connection = TransactionManager.current().connection.connection as Connection

    private fun daemonThreads(name: String) = object : java.util.concurrent.ThreadFactory {
        private val counter = AtomicInteger()
        override fun newThread(r: Runnable) = Thread(r, "$name-${counter.incrementAndGet()}").apply { isDaemon = true }
    }
}
