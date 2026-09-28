package org.loculus.backend.query.cache

import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.notNullValue
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.springframework.util.unit.DataSize
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.io.path.listDirectoryEntries

class ResponseCacheTest {
    @TempDir
    lateinit var dir: Path

    private val meters = SimpleMeterRegistry()
    private var now = 1_000_000L
    private val tokens = HashMap<String, String>()
    private val caches = mutableListOf<ResponseCache>()

    @AfterEach
    fun close() = caches.forEach(ResponseCache::close)

    private fun cache(
        memory: Long = 100_000,
        memoryMaxEntry: Long? = null,
        disk: Long = 0,
        diskMaxEntry: Long? = null,
        waitMs: Long = 5_000,
    ) = ResponseCache(
        ResponseCacheProperties(
            memorySize = DataSize.ofBytes(memory),
            memoryMaxEntrySize = memoryMaxEntry?.let(DataSize::ofBytes),
            diskSize = DataSize.ofBytes(disk),
            diskMaxEntrySize = diskMaxEntry?.let(DataSize::ofBytes),
            diskPath = if (disk > 0) dir.toString() else null,
            singleFlightWaitMs = waitMs,
        ),
        meters,
        diskExecutor = { it.run() },
        tokenSource = { tokens[it] },
        clock = { now },
        scheduleSweeps = false,
    ).also { caches.add(it) }

    private fun key(hash: String, token: String = "t1", organism: String = "o") = CacheKey(organism, token, hash)

    private fun response(length: Int, codec: WireCodec = WireCodec.IDENTITY) =
        CachedResponse(listOf("Content-Type" to "text/plain"), codec, null, length.toLong())

    private fun body(size: Int, fill: Char = 'x') = ByteArray(size) { fill.code.toByte() }

    /** a lookup (sighting) followed by an offer, like a miss */
    private fun miss(cache: ResponseCache, key: CacheKey, size: Int, ms: Double = 10.0): String {
        assertThat(cache.lookup(key), nullValue())
        return cache.offer(key, response(size), body(size), MissCost(ms, dbRows = 100, dbBytes = 5000))
    }

    private fun read(hit: ResponseCache.Hit?) = hit!!.open().use { it.readAllBytes() }

    private fun count(name: String, vararg tags: String) = meters.find(name).tags(*tags).counters().sumOf { it.count() }

    private fun bodyFiles() = dir.listDirectoryEntries().filter { it.fileName.toString().endsWith(".body") }

    @Test
    fun `admission from the second sighting on`() {
        val cache = cache()
        assertThat(miss(cache, key("a"), 1000), equalTo("first_sightings"))
        assertThat(miss(cache, key("a"), 1000), equalTo("memory"))
        assertThat(read(cache.lookup(key("a"))).size, equalTo(1000))
        assertThat(count("loculus.query.cache.lookups", "tier", "memory", "result", "hit"), equalTo(1.0))
        assertThat(count("loculus.query.cache.lookups", "tier", "memory", "result", "miss"), equalTo(2.0))
        assertThat(count("loculus.query.cache.saved.db.rows"), equalTo(100.0))
        assertThat(count("loculus.query.cache.saved.db.bytes"), equalTo(5000.0))
        assertThat(count("loculus.query.cache.saved.engine"), equalTo(10.0))
    }

    @Test
    fun `the memory budget holds, weak entries are evicted and the threshold rises`() {
        // entries of 10_000 + overhead: 3 fit
        val cache = cache(memory = 33_000, memoryMaxEntry = 11_000)
        for ((i, ms) in listOf(1.0, 5.0, 10.0).withIndex()) {
            cache.lookup(key("k$i"))
            miss(cache, key("k$i"), 10_000, ms)
        }
        assertThat(cache.memory.size(), equalTo(3))
        val threshold = cache.memory.threshold()
        assertThat(threshold > 0, equalTo(true))
        assertThat(
            meters.find("loculus.query.cache.threshold").tag("tier", "memory").gauge()!!.value(),
            equalTo(threshold),
        )

        cache.lookup(key("weak"))
        assertThat(miss(cache, key("weak"), 10_000, 0.5), equalTo("not_admitted"))
        cache.lookup(key("strong"))
        assertThat(miss(cache, key("strong"), 10_000, 50.0), equalTo("memory"))
        assertThat(cache.lookup(key("k0"), sighting = false), nullValue())
        assertThat(cache.memory.usedBytes() <= 33_000, equalTo(true))
    }

    @Test
    fun `memory evictions are demoted to disk and served from there`() {
        val cache = cache(memory = 22_000, memoryMaxEntry = 11_000, disk = 1_000_000)
        for ((i, ms) in listOf(1.0, 5.0, 10.0).withIndex()) {
            cache.lookup(key("k$i"))
            miss(cache, key("k$i"), 10_000, ms)
        }
        assertThat(cache.memory.size(), equalTo(2))
        assertThat(cache.disk.size(), equalTo(1))
        assertThat(count("loculus.query.cache.demotions"), equalTo(1.0))
        assertThat(bodyFiles(), hasSize(1))
        // identity bodies are zstd-compressed on disk
        assertThat(Files.size(bodyFiles().single()) < 10_000, equalTo(true))
        val hit = cache.lookup(key("k0"))
        assertThat(hit!!.tier, equalTo("disk"))
        assertThat(read(hit).toList(), equalTo(body(10_000).toList()))
    }

    @Test
    fun `responses too large for memory go to disk, within the disk budget`() {
        val cache = cache(memory = 50_000, memoryMaxEntry = 5_000, disk = 30_000, diskMaxEntry = 30_000)
        cache.lookup(key("big"))
        // incompressible, so the stored size is the body size
        val random = java.util.Random(1)
        val bytes = ByteArray(20_000).also(random::nextBytes)
        assertThat(cache.lookup(key("big")), nullValue())
        assertThat(cache.offer(key("big"), response(20_000), bytes, MissCost(100.0)), equalTo("disk"))
        assertThat(read(cache.lookup(key("big"))).toList(), equalTo(bytes.toList()))
        assertThat(cache.disk.usedBytes() <= 30_000, equalTo(true))
    }

    @Test
    fun `a disk hit that beats the memory threshold is promoted`() {
        val cache = cache(memory = 22_000, memoryMaxEntry = 11_000, disk = 1_000_000)
        for ((i, ms) in listOf(1.0, 5.0, 10.0).withIndex()) {
            cache.lookup(key("k$i"))
            miss(cache, key("k$i"), 10_000, ms)
        }
        // k0 (1 ms) is on disk; hits raise its frequency until it beats memory's weakest entry
        repeat(10) { read(cache.lookup(key("k0"))) }
        assertThat(count("loculus.query.cache.promotions") >= 1.0, equalTo(true))
        assertThat(cache.memory.peek(key("k0")), notNullValue())
        assertThat(cache.disk.peek(key("k0")), nullValue())
        assertThat(cache.memory.usedBytes() <= 22_000, equalTo(true))
    }

    @Test
    fun `identical concurrent misses share the first one's result`() {
        val cache = cache()
        val leader = cache.beginFlight(key("a")) as ResponseCache.Flight.Leader
        val follower = cache.beginFlight(key("a")) as ResponseCache.Flight.Follower
        val waiting = CompletableFuture.supplyAsync { cache.await(follower) }
        Thread.sleep(50)
        assertThat(waiting.isDone, equalTo(false))
        cache.finish(leader, ResponseCache.Shared(response(3), "abc".toByteArray()))
        assertThat(String(waiting.get(5, TimeUnit.SECONDS)!!.body), equalTo("abc"))
        // the flight is over: the next miss leads again
        assertThat(
            cache.beginFlight(key("a")),
            org.hamcrest.Matchers.instanceOf(ResponseCache.Flight.Leader::class.java),
        )
        assertThat(count("loculus.query.cache.single.flight.joins"), equalTo(1.0))
    }

    @Test
    fun `a failed leader releases its followers at once, and a slow one after the wait`() {
        val cache = cache(waitMs = 200)
        val leader = cache.beginFlight(key("a")) as ResponseCache.Flight.Leader
        val follower = cache.beginFlight(key("a")) as ResponseCache.Flight.Follower
        val released = CountDownLatch(1)
        CompletableFuture.runAsync {
            cache.await(follower)
            released.countDown()
        }
        cache.finish(leader, null)
        assertThat(released.await(1, TimeUnit.SECONDS), equalTo(true))

        cache.beginFlight(key("b"))
        val slow = cache.beginFlight(key("b")) as ResponseCache.Flight.Follower
        val started = System.nanoTime()
        assertThat(cache.await(slow), nullValue())
        assertThat((System.nanoTime() - started) / 1e6 >= 190, equalTo(true))
    }

    @Test
    fun `superseded tokens are purged after the grace period, with their files`() {
        val cache = cache(memory = 22_000, memoryMaxEntry = 11_000, disk = 1_000_000)
        tokens["o"] = "t1"
        for (i in 0..2) {
            cache.lookup(key("k$i"))
            miss(cache, key("k$i"), 10_000, i + 1.0)
        }
        tokens["other"] = "x"
        cache.lookup(key("z", token = "x", organism = "other"))
        miss(cache, key("z", token = "x", organism = "other"), 1000)
        // k0 and k1 were displaced to disk
        assertThat(bodyFiles(), hasSize(2))

        // the index moved on: the sweep notices the new token, and purges only after the grace period
        tokens["o"] = "t2"
        now += 1_000
        cache.sweep()
        assertThat(cache.memory.size() + cache.disk.size(), equalTo(4))
        assertThat(bodyFiles(), hasSize(2))
        // an entry computed from the old state is no longer admitted
        assertThat(cache.offer(key("late"), response(10), body(10), MissCost(1.0)), equalTo("stale"))
        now += cache.properties.staleGraceMs
        cache.sweep()
        assertThat(cache.memory.size(), equalTo(1))
        assertThat(cache.disk.size(), equalTo(0))
        assertThat(bodyFiles(), empty())
        assertThat(count("loculus.query.cache.purged", "reason", "superseded"), equalTo(3.0))
        assertThat(cache.lookup(key("z", token = "x", organism = "other")), notNullValue())
    }

    @Test
    fun `entries older than the maximum age are purged`() {
        val cache = cache(disk = 1_000_000, memory = 11_000, memoryMaxEntry = 11_000)
        tokens["o"] = "t1"
        cache.lookup(key("a"))
        miss(cache, key("a"), 10_000)
        cache.lookup(key("b"))
        miss(cache, key("b"), 10_000, 100.0)
        assertThat(cache.memory.size() + cache.disk.size(), equalTo(2))
        now += cache.properties.maxAgeMs - 1
        cache.sweep()
        assertThat(cache.memory.size() + cache.disk.size(), equalTo(2))
        now += 2
        cache.sweep()
        assertThat(cache.memory.size() + cache.disk.size(), equalTo(0))
        assertThat(bodyFiles(), empty())
        assertThat(count("loculus.query.cache.purged", "reason", "max_age"), equalTo(2.0))
    }

    @Test
    fun `a streamed copy is published only when completed`() {
        val cache = cache(memory = 1_000, memoryMaxEntry = 1_000, disk = 1_000_000)
        val k = key("stream")
        cache.lookup(k)
        cache.lookup(k)

        val failed = cache.tee(k, WireCodec.GZIP)!!
        failed.write(body(5_000))
        assertThat(dir.listDirectoryEntries(), hasSize(1)) // the temp file
        failed.abandon()
        assertThat(dir.listDirectoryEntries(), empty())
        assertThat(cache.lookup(k, sighting = false), nullValue())

        val ok = cache.tee(k, WireCodec.GZIP)!!
        ok.write(body(3_000, 'a'))
        ok.write(body(2_000, 'b'))
        assertThat(ok.complete(response(5_000, WireCodec.GZIP), MissCost(400.0)), equalTo("disk"))
        assertThat(dir.listDirectoryEntries().map { it.fileName.toString().startsWith("tmp") }, equalTo(listOf(false)))
        assertThat(read(cache.lookup(k)).toList(), equalTo((body(3_000, 'a') + body(2_000, 'b')).toList()))
    }

    @Test
    fun `a streamed copy larger than the disk entry limit is given up`() {
        val cache = cache(memory = 1_000, memoryMaxEntry = 1_000, disk = 100_000, diskMaxEntry = 4_000)
        val k = key("huge")
        cache.lookup(k)
        cache.lookup(k)
        val tee = cache.tee(k, WireCodec.ZSTD)!!
        tee.write(body(3_000))
        tee.write(body(3_000))
        assertThat(tee.abandoned, equalTo(true))
        assertThat(tee.complete(response(6_000, WireCodec.ZSTD), MissCost(1.0)), equalTo("abandoned"))
        assertThat(dir.listDirectoryEntries(), empty())
    }

    @Test
    fun `a one-off request is not copied at all`() {
        val cache = cache(disk = 1_000_000)
        cache.lookup(key("once"))
        assertThat(cache.tee(key("once"), WireCodec.IDENTITY), nullValue())
    }

    @Test
    fun `a restart starts with an empty disk tier`() {
        val first = cache(memory = 0, disk = 1_000_000)
        first.lookup(key("a"))
        miss(first, key("a"), 10_000)
        assertThat(bodyFiles(), hasSize(1))
        Files.writeString(dir.resolve("tmp-leftover"), "x")
        first.close()

        val second = cache(memory = 0, disk = 1_000_000)
        assertThat(dir.listDirectoryEntries(), empty())
        assertThat(second.lookup(key("a")), nullValue())
        assertThat(second.disk.size(), equalTo(0))
    }

    @Test
    fun `a disabled cache does nothing`() {
        val cache = cache(memory = 0, disk = 0)
        assertThat(cache.enabled, equalTo(false))
        assertThat(cache.lookup(key("a")), nullValue())
        assertThat(cache.offer(key("a"), response(1), body(1), MissCost(1.0)), equalTo("disabled"))
    }
}
