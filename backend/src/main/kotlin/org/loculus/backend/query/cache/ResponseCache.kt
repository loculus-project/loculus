package org.loculus.backend.query.cache

import com.github.luben.zstd.ZstdInputStream
import com.github.luben.zstd.ZstdOutputStream
import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import mu.KotlinLogging
import java.io.BufferedOutputStream
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executor
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicLong

private val log = KotlinLogging.logger {}

/**
 * Two-tier cache of rendered query responses (memory, then disk), keyed by [CacheKey].
 *
 * - Admission: a [FrequencySketch] counts every lookup; a response is admitted from the
 *   [ResponseCacheProperties.admitAfterSightings]th sighting of its request on, and into a full tier only above the
 *   tier's threshold ([CacheTier]).
 * - Memory entries displaced from the memory tier are demoted to the disk tier (if they beat its threshold); a disk
 *   hit that would beat the memory threshold is promoted back.
 * - Disk entries are one file each, published by rename after the whole body was written, and deleted when they are
 *   evicted or their organism's content token moved on. The directory is wiped at startup.
 * - Entries of an organism's superseded content token are purged in the background once the new token has been
 *   current for [ResponseCacheProperties.staleGraceMs] (new requests cannot hit them anyway: the token is part of
 *   the key); every entry is purged after [ResponseCacheProperties.maxAgeMs].
 *
 * [tokenSource] gives an organism's current content token (null while it has no index) for the background purge;
 * lookups report the tokens they see too. [clock] is epoch ms.
 */
class ResponseCache(
    val properties: ResponseCacheProperties,
    private val meters: MeterRegistry,
    diskExecutor: Executor? = null,
    private val tokenSource: (String) -> String? = { null },
    private val clock: () -> Long = System::currentTimeMillis,
    scheduleSweeps: Boolean = true,
) : AutoCloseable {
    val memory = CacheTier("memory", properties.memoryBudget, properties.memoryMaxEntry)
    val disk = CacheTier("disk", properties.diskBudget, properties.diskMaxEntry)
    val enabled = memory.enabled || disk.enabled

    private val ownExecutor: ExecutorService? = if (diskExecutor == null && disk.enabled) {
        Executors.newSingleThreadExecutor { r -> Thread(r, "query-cache-disk").apply { isDaemon = true } }
    } else {
        null
    }
    private val diskExecutor: Executor = diskExecutor ?: ownExecutor ?: Executor { it.run() }
    private val diskDir: Path? = if (disk.enabled) Path.of(properties.diskPath!!) else null
    private val sketch = FrequencySketch(properties.sketchCounters)
    private class TokenState(val token: String, val sinceMs: Long)

    private val tokens = ConcurrentHashMap<String, TokenState>()
    private val inFlight = ConcurrentHashMap<String, CompletableFuture<Shared?>>()
    private val teePermits = Semaphore(properties.maxConcurrentDiskTees.coerceAtLeast(0))
    private val fileSeq = AtomicLong()
    private val sweeper: ScheduledExecutorService? = if (enabled && scheduleSweeps) {
        Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "query-cache-sweep").apply { isDaemon = true } }
    } else {
        null
    }

    init {
        diskDir?.let(::wipe)
        for (tier in listOf(memory, disk)) {
            Gauge.builder("loculus.query.cache.bytes") { tier.usedBytes().toDouble() }
                .tag("tier", tier.name).baseUnit("bytes").register(meters)
            Gauge.builder("loculus.query.cache.budget") { tier.budgetBytes.toDouble() }
                .tag("tier", tier.name).baseUnit("bytes").register(meters)
            Gauge.builder("loculus.query.cache.entries") { tier.size().toDouble() }
                .tag("tier", tier.name).register(meters)
            Gauge.builder("loculus.query.cache.threshold") { tier.threshold() }
                .tag("tier", tier.name)
                .description("priority (hits x ms per MB, plus aging) a new entry must exceed; 0 while not full")
                .register(meters)
        }
        sweeper?.scheduleWithFixedDelay(
            { runCatching { sweep() }.onFailure { log.warn(it) { "Query engine cache: purge failed" } } },
            properties.sweepIntervalMs,
            properties.sweepIntervalMs,
            TimeUnit.MILLISECONDS,
        )
        if (enabled) {
            log.info {
                "Query engine response cache: memory ${memory.budgetBytes} B (entries up to ${memory.maxEntryBytes})," +
                    " disk ${disk.budgetBytes} B (entries up to ${disk.maxEntryBytes}) at $diskDir"
            }
        }
    }

    /** a response that is being served from the cache */
    class Hit(val entry: TierEntry, val tier: String, private val stream: () -> InputStream) {
        val response get() = entry.response

        /** the stored body; read it exactly once */
        fun open(): InputStream = stream()
    }

    /** a finished response shared with identical concurrent requests */
    class Shared(val response: CachedResponse, val body: ByteArray)

    // ---------------- lookup ----------------

    /** [sighting]: count this lookup as a sighting of the request (false when a request looks again) */
    fun lookup(key: CacheKey, sighting: Boolean = true): Hit? {
        if (!enabled) return null
        observeToken(key.organism, key.contentToken)
        if (sighting) sketch.increment(key.popularityId)
        if (memory.enabled) {
            val entry = memory.hit(key)
            if (entry != null) {
                countLookup(key, memory, hit = true)
                saved(entry)
                val bytes = (entry.payload as Payload.Memory).bytes
                return Hit(entry, memory.name) { ByteArrayInputStream(bytes) }
            }
            countLookup(key, memory, hit = false)
        }
        if (disk.enabled) {
            val entry = disk.hit(key)
            if (entry != null) {
                val hit = openDisk(entry)
                if (hit != null) {
                    countLookup(key, disk, hit = true)
                    saved(entry)
                    return hit
                }
            }
            countLookup(key, disk, hit = false)
        }
        return null
    }

    private fun openDisk(entry: TierEntry): Hit? {
        val payload = entry.payload as Payload.Disk
        val promote = memory.enabled && entry.response.bodyLength + OVERHEAD <= memory.maxEntryBytes &&
            memory.priorityOf(entry.frequency, entry.costMs, entry.response.bodyLength + OVERHEAD) > memory.threshold()
        return try {
            if (promote) {
                val bytes = readDisk(payload)
                promote(entry, bytes)
                Hit(entry, disk.name) { ByteArrayInputStream(bytes) }
            } else {
                // opened now: an eviction that deletes the file later does not affect this response
                val file = Files.newInputStream(payload.path)
                Hit(entry, disk.name) { if (payload.zstd) ZstdInputStream(file) else file }
            }
        } catch (e: IOException) {
            log.warn { "Query engine cache: cannot read ${payload.path}, dropping the entry: $e" }
            if (disk.remove(entry)) deleteLater(payload.path)
            null
        }
    }

    private fun readDisk(payload: Payload.Disk): ByteArray = Files.newInputStream(payload.path).use { file ->
        (if (payload.zstd) ZstdInputStream(file) else file).use { it.readAllBytes() }
    }

    private fun promote(entry: TierEntry, bytes: ByteArray) {
        val candidate = TierEntry(
            entry.key,
            entry.response,
            Payload.Memory(bytes),
            entry.cost,
            entry.costMs,
            bytes.size + OVERHEAD,
            entry.frequency,
            entry.createdAtMs,
        )
        val admission = memory.admit(candidate)
        count("loculus.query.cache.admissions", memory, admission)
        if (admission is Admission.Admitted) {
            meters.counter("loculus.query.cache.promotions").increment()
            if (disk.remove(entry)) deleteLater((entry.payload as Payload.Disk).path)
            admission.evicted.forEach(::demote)
        }
    }

    /** records that [token] is [organism]'s current content token (from when it was first seen) */
    fun observeToken(organism: String, token: String) {
        tokens.compute(organism) { _, state -> if (state?.token == token) state else TokenState(token, clock()) }
    }

    /**
     * The background purge: entries of superseded tokens once the current one is [ResponseCacheProperties.staleGraceMs]
     * old, and entries older than [ResponseCacheProperties.maxAgeMs]. Disk files are deleted.
     */
    fun sweep() {
        val now = clock()
        val organisms = memory.organisms() + disk.organisms() + tokens.keys
        for (organism in organisms) {
            tokenSource(organism)?.let { observeToken(organism, it) }
            val state = tokens[organism] ?: continue
            if (now - state.sinceMs < properties.staleGraceMs) continue
            purged("superseded", memory.dropStale(organism, state.token), disk.dropStale(organism, state.token))
        }
        val cutoff = now - properties.maxAgeMs
        purged("max_age", memory.dropOlderThan(cutoff), disk.dropOlderThan(cutoff))
    }

    private fun purged(reason: String, fromMemory: List<TierEntry>, fromDisk: List<TierEntry>) {
        fromDisk.forEach { deleteLater((it.payload as Payload.Disk).path) }
        if (fromMemory.isEmpty() && fromDisk.isEmpty()) return
        meters.counter("loculus.query.cache.purged", "tier", memory.name, "reason", reason)
            .increment(fromMemory.size.toDouble())
        meters.counter("loculus.query.cache.purged", "tier", disk.name, "reason", reason)
            .increment(fromDisk.size.toDouble())
        log.debug { "Query engine cache: purged ${fromMemory.size} + ${fromDisk.size} entries ($reason)" }
    }

    // ---------------- single flight ----------------

    sealed interface Flight {
        class Leader(internal val key: CacheKey, internal val future: CompletableFuture<Shared?>) : Flight

        class Follower(internal val future: CompletableFuture<Shared?>) : Flight
    }

    /** the first identical concurrent miss leads (and must [finish]); the others follow and [await] it */
    fun beginFlight(key: CacheKey): Flight {
        val future = CompletableFuture<Shared?>()
        val existing = inFlight.putIfAbsent(key.id, future)
        return if (existing == null) Flight.Leader(key, future) else Flight.Follower(existing)
    }

    /** always called by a leader, with its shareable result or null (failed, streamed, not reproducible) */
    fun finish(flight: Flight.Leader, shared: Shared?) {
        inFlight.remove(flight.key.id, flight.future)
        flight.future.complete(shared)
    }

    /** the leader's result, or null when it had none or took longer than the configured wait */
    fun await(flight: Flight.Follower): Shared? {
        meters.counter("loculus.query.cache.single.flight.joins").increment()
        return try {
            flight.future.get(properties.singleFlightWaitMs, TimeUnit.MILLISECONDS)
        } catch (_: TimeoutException) {
            null
        }
    }

    // ---------------- admission ----------------

    /** offers a fully rendered response; returns the outcome (for logs and tests) */
    fun offer(key: CacheKey, response: CachedResponse, body: ByteArray, cost: MissCost): String {
        if (!enabled) return "disabled"
        rejectReason(key)?.let { return it }
        val frequency = sketch.estimate(key.popularityId)
        val size = body.size + response.headersSize() + OVERHEAD
        val costMs = weighted(cost)
        val createdAt = clock()
        if (memory.enabled && size <= memory.maxEntryBytes) {
            val candidate = TierEntry(key, response, Payload.Memory(body), cost, costMs, size, frequency, createdAt)
            val admission = memory.admit(candidate)
            count("loculus.query.cache.admissions", memory, admission)
            if (admission is Admission.Admitted) {
                admission.evicted.forEach(::demote)
                return "memory"
            }
        }
        return writeToDisk(key, response, body, cost, frequency, createdAt)
    }

    private fun weighted(cost: MissCost) = cost.weighted(properties.dbRowCostMs, properties.dbMegabyteCostMs)

    private fun rejectReason(key: CacheKey): String? {
        if (tokens[key.organism]?.token != key.contentToken) return "stale"
        if (sketch.estimate(key.popularityId) < properties.admitAfterSightings) {
            meters.counter(
                "loculus.query.cache.admissions",
                "tier",
                "any",
                "result",
                "rejected",
                "reason",
                "first_sightings",
            )
                .increment()
            return "first_sightings"
        }
        return null
    }

    private fun demote(victim: TierEntry) {
        val bytes = (victim.payload as Payload.Memory).bytes
        val outcome = writeToDisk(victim.key, victim.response, bytes, victim.cost, victim.frequency, victim.createdAtMs)
        if (outcome == "disk") {
            meters.counter("loculus.query.cache.demotions").increment()
        } else {
            meters.counter("loculus.query.cache.evictions", "tier", memory.name).increment()
        }
    }

    private fun writeToDisk(
        key: CacheKey,
        response: CachedResponse,
        body: ByteArray,
        cost: MissCost,
        frequency: Int,
        createdAt: Long,
    ): String {
        val dir = diskDir ?: return "not_admitted"
        if (tokens[key.organism]?.token != key.contentToken) return "stale"
        val zstd = response.codec == WireCodec.IDENTITY
        // compressed here, so that the entry is charged what it occupies on disk
        val stored = if (zstd) WireCodec.ZSTD.encodeWhole(body) else body
        val path = newPath(dir, key)
        val candidate = TierEntry(
            key,
            response,
            Payload.Disk(path, stored.size.toLong(), zstd),
            cost,
            weighted(cost),
            stored.size + OVERHEAD,
            frequency,
            createdAt,
        )
        candidate.ready = false
        val admission = disk.admit(candidate)
        count("loculus.query.cache.admissions", disk, admission)
        if (admission !is Admission.Admitted) return "not_admitted"
        evicted(admission)
        diskExecutor.execute {
            try {
                val tmp = dir.resolve("tmp-${path.fileName}")
                FileOutputStream(tmp.toFile()).use { file ->
                    file.write(stored)
                    file.fd.sync()
                }
                publish(tmp, path, candidate)
            } catch (e: IOException) {
                log.warn { "Query engine cache: writing $path failed: $e" }
                disk.remove(candidate)
                deleteQuietly(path)
            }
        }
        return "disk"
    }

    private fun publish(tmp: Path, path: Path, entry: TierEntry) {
        if (!hasSpace(Files.size(tmp))) {
            disk.remove(entry)
            deleteQuietly(tmp)
            meters.counter(
                "loculus.query.cache.admissions",
                "tier",
                disk.name,
                "result",
                "rejected",
                "reason",
                "no_space",
            )
                .increment()
            return
        }
        Files.move(tmp, path, StandardCopyOption.ATOMIC_MOVE)
        // evicted or invalidated while being written
        if (!disk.markReady(entry)) deleteQuietly(path)
    }

    private fun hasSpace(bytes: Long): Boolean = try {
        Files.getFileStore(diskDir!!).usableSpace > bytes + MIN_FREE_BYTES
    } catch (_: IOException) {
        false
    }

    private fun evicted(admission: Admission.Admitted) {
        for (victim in admission.evicted) {
            meters.counter("loculus.query.cache.evictions", "tier", disk.name).increment()
            deleteLater((victim.payload as Payload.Disk).path)
        }
    }

    // ---------------- tee (streamed responses) ----------------

    /**
     * Copy of a streamed response's wire bytes: in memory up to the memory tier's entry limit, then in a temp file in
     * the disk directory up to the disk tier's (if a tee permit is free), else given up. Never throws: a failing
     * copy only means the response is not cached.
     */
    inner class Tee internal constructor(private val key: CacheKey, private val codec: WireCodec) : OutputStream() {
        private var buffer: ByteArrayOutputStream? = ByteArrayOutputStream(4096)
        private var tmp: Path? = null
        private var file: FileOutputStream? = null
        private var fileOut: OutputStream? = null
        private var permit = false

        /** bytes copied so far */
        var length = 0L
            private set
        var abandoned = false
            private set

        override fun write(b: Int) = write(byteArrayOf(b.toByte()), 0, 1)

        override fun write(b: ByteArray, off: Int, len: Int) {
            if (abandoned) return
            try {
                length += len
                val memoryBuffer = buffer
                if (memoryBuffer != null) {
                    if (length <= memory.maxEntryBytes) {
                        memoryBuffer.write(b, off, len)
                        return
                    }
                    spill(memoryBuffer) ?: return abandon()
                }
                if (length > disk.maxEntryBytes) return abandon()
                fileOut!!.write(b, off, len)
            } catch (e: IOException) {
                log.warn { "Query engine cache: copying a response for ${key.organism} failed: $e" }
                abandon()
            }
        }

        private fun spill(memoryBuffer: ByteArrayOutputStream): Unit? {
            val dir = diskDir ?: return null
            if (!teePermits.tryAcquire()) return null
            permit = true
            buffer = null
            val path = dir.resolve("tmp-tee-${fileSeq.incrementAndGet()}")
            tmp = path
            val f = FileOutputStream(path.toFile())
            file = f
            val buffered = BufferedOutputStream(f, 64 * 1024)
            fileOut = if (codec == WireCodec.IDENTITY) ZstdOutputStream(buffered, WireCodec.ZSTD_LEVEL) else buffered
            memoryBuffer.writeTo(fileOut!!)
            return Unit
        }

        /** the response was sent completely; offers it and returns the outcome */
        fun complete(response: CachedResponse, cost: MissCost): String {
            if (abandoned) return "abandoned"
            val memoryBuffer = buffer
            if (memoryBuffer != null) {
                buffer = null
                return offer(key, response, memoryBuffer.toByteArray(), cost)
            }
            val path = tmp!!
            return try {
                fileOut!!.close()
                releasePermit()
                offerFile(key, response, path, cost)
            } catch (e: IOException) {
                log.warn { "Query engine cache: finishing a copy for ${key.organism} failed: $e" }
                abandon()
                "abandoned"
            }
        }

        /** the response failed (or is not cacheable after all): drop the copy */
        fun abandon() {
            if (abandoned) return
            abandoned = true
            buffer = null
            runCatching { fileOut?.close() }
            tmp?.let(::deleteQuietly)
            releasePermit()
        }

        private fun releasePermit() {
            if (permit) {
                permit = false
                teePermits.release()
            }
        }

        override fun close() {}
    }

    fun tee(key: CacheKey, codec: WireCodec): Tee? {
        if (!enabled || sketch.estimate(key.popularityId) < properties.admitAfterSightings) return null
        return Tee(key, codec)
    }

    private fun offerFile(key: CacheKey, response: CachedResponse, tmp: Path, cost: MissCost): String {
        val reason = rejectReason(key)
        if (reason != null) {
            deleteQuietly(tmp)
            return reason
        }
        val dir = diskDir!!
        val size = Files.size(tmp)
        val path = newPath(dir, key)
        val candidate = TierEntry(
            key,
            response,
            Payload.Disk(path, size, response.codec == WireCodec.IDENTITY),
            cost,
            weighted(cost),
            size + OVERHEAD,
            sketch.estimate(key.popularityId),
            clock(),
        )
        candidate.ready = false
        val admission = disk.admit(candidate)
        count("loculus.query.cache.admissions", disk, admission)
        if (admission !is Admission.Admitted) {
            deleteQuietly(tmp)
            return "not_admitted"
        }
        evicted(admission)
        return try {
            FileOutputStream(tmp.toFile(), true).use { it.fd.sync() }
            publish(tmp, path, candidate)
            if (candidate.ready) "disk" else "not_admitted"
        } catch (e: IOException) {
            log.warn { "Query engine cache: publishing $path failed: $e" }
            disk.remove(candidate)
            deleteQuietly(tmp)
            deleteQuietly(path)
            "not_admitted"
        }
    }

    // ---------------- helpers ----------------

    private fun newPath(dir: Path, key: CacheKey): Path {
        val digest = MessageDigest.getInstance("SHA-256").digest(key.id.toByteArray())
        val name = digest.copyOf(12).joinToString("") { "%02x".format(it) }
        return dir.resolve("$name-${fileSeq.incrementAndGet()}.body")
    }

    private fun deleteLater(path: Path) = diskExecutor.execute { deleteQuietly(path) }

    private fun deleteQuietly(path: Path) {
        try {
            Files.deleteIfExists(path)
        } catch (e: IOException) {
            log.warn { "Query engine cache: cannot delete $path: $e" }
        }
    }

    private fun wipe(dir: Path) {
        Files.createDirectories(dir)
        Files.list(dir).use { files -> files.forEach { runCatching { it.toFile().deleteRecursively() } } }
    }

    private fun countLookup(key: CacheKey, tier: CacheTier, hit: Boolean) =
        Counter.builder("loculus.query.cache.lookups")
            .tag("organism", key.organism).tag("tier", tier.name).tag("result", if (hit) "hit" else "miss")
            .register(meters).increment()

    /** the work a hit avoided: what the miss that produced the entry cost */
    private fun saved(entry: TierEntry) {
        meters.counter("loculus.query.cache.saved.engine", "unit", "ms").increment(entry.cost.engineMs)
        meters.counter("loculus.query.cache.saved.db.rows").increment(entry.cost.dbRows.toDouble())
        meters.counter("loculus.query.cache.saved.db.bytes").increment(entry.cost.dbBytes.toDouble())
    }

    private fun count(name: String, tier: CacheTier, admission: Admission) = when (admission) {
        is Admission.Admitted -> meters.counter(name, "tier", tier.name, "result", "admitted", "reason", "").increment()

        is Admission.Rejected -> meters.counter(
            name,
            "tier",
            tier.name,
            "result",
            "rejected",
            "reason",
            admission.reason,
        )
            .increment()
    }

    override fun close() {
        sweeper?.shutdownNow()
        ownExecutor?.shutdown()
    }

    /** blocks until disk writes queued so far are done (tests, shutdown) */
    fun awaitDiskWrites() {
        CompletableFuture.runAsync({}, diskExecutor).get(30, TimeUnit.SECONDS)
    }

    companion object {
        /** bytes charged per entry for key, headers and bookkeeping objects */
        const val OVERHEAD = 512L
        private const val MIN_FREE_BYTES = 64L * 1024 * 1024
    }
}

private fun CachedResponse.headersSize(): Long =
    headers.sumOf { (k, v) -> (k.length + v.length) * 2L } + (splice?.suffix?.size ?: 0)
