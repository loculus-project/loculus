package org.loculus.backend.query.index

import io.mockk.every
import io.mockk.mockk
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.everyItem
import org.hamcrest.Matchers.greaterThanOrEqualTo
import org.hamcrest.Matchers.instanceOf
import org.hamcrest.Matchers.lessThan
import org.hamcrest.Matchers.notNullValue
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.Test
import org.loculus.backend.query.QueryEngineProperties
import org.loculus.backend.query.QuerySchemaRegistry
import org.loculus.backend.query.index.IndexLookup.Ready
import org.loculus.backend.query.index.IndexLookup.Unavailable
import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.health.contributor.Status
import java.lang.reflect.Proxy
import java.sql.Connection
import java.sql.PreparedStatement
import java.sql.ResultSet
import java.sql.SQLException
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import javax.sql.DataSource

class QueryIndexServiceTest {
    private val registry = mockk<QuerySchemaRegistry> {
        every { schemas } returns mapOf("test" to IndexTestSupport.schema())
    }

    @Test
    fun `an Error in an update does not stop later updates`() {
        val attempts = AtomicInteger()
        val dataSource = mockk<DataSource> {
            every { connection } answers {
                attempts.incrementAndGet()
                throw StackOverflowError("test")
            }
        }
        val service = QueryIndexService(registry, dataSource, QueryEngineProperties(enabled = true, tailIntervalMs = 5))
        try {
            service.start()
            val deadline = System.currentTimeMillis() + 10_000
            while (attempts.get() < 3 && System.currentTimeMillis() < deadline) Thread.sleep(5)
            assertThat(attempts.get(), greaterThanOrEqualTo(3))
        } finally {
            service.destroy()
        }
    }

    @Test
    fun `a failed reload is retried under the reload lock, with backoff`() {
        // (time, reload lock held) at the start of every full load; the reload (load 2) and its first retry fail
        val loads = CopyOnWriteArrayList<Pair<Long, Boolean>>()
        lateinit var service: QueryIndexService
        val dataSource = fakeDataSource { sql ->
            when {
                "coalesce(max(seq), 0) from query_changelog" in sql -> {
                    loads += System.currentTimeMillis() to service.reloadLock.isHeldByCurrentThread
                    if (loads.size in 2..3) throw SQLException("test")
                    rows(0)
                }

                // a changelog backlog large enough for a reload, until the reload has started
                "order by seq limit" in sql && loads.size == 1 -> rows(QueryIndexService.REBUILD_MIN_CHANGES + 1)

                "count(distinct id)" in sql -> rows(1)

                else -> rows(0)
            }
        }
        service = QueryIndexService(registry, dataSource, QueryEngineProperties(enabled = true, tailIntervalMs = 5))
        try {
            service.start()
            val deadline = System.currentTimeMillis() + 20_000
            while ((loads.size < 4 || service.get("test") == null) && System.currentTimeMillis() < deadline) {
                Thread.sleep(5)
            }
            assertThat(loads.size, equalTo(4))
            assertThat(
                "every load after the first holds the reload lock",
                loads.drop(1).map { it.second },
                everyItem(equalTo(true)),
            )
            assertThat(loads[2].first - loads[1].first, greaterThanOrEqualTo(900L))
            assertThat(loads[3].first - loads[2].first, greaterThanOrEqualTo(1900L))
            assertThat(service.get("test"), notNullValue())
        } finally {
            service.destroy()
        }
    }

    @Test
    fun `a projection rebuild's backlog is loaded by one reload after the rebuild`() {
        val rebuilding = AtomicBoolean(true)
        val loads = AtomicInteger()
        val tails = AtomicInteger()
        val dataSource = fakeDataSource { sql ->
            when {
                "coalesce(max(seq), 0) from query_changelog" in sql -> {
                    loads.incrementAndGet()
                    rows(0)
                }

                // the rebuild's changelog backlog, until a reload has started
                "order by seq limit" in sql -> {
                    tails.incrementAndGet()
                    rows(if (loads.get() == 1) QueryIndexService.REBUILD_MIN_CHANGES + 1 else 0)
                }

                "encoding_hash" in sql -> rows(1, flag = rebuilding.get())

                "count(distinct id)" in sql -> rows(1)

                else -> rows(0)
            }
        }
        val service = QueryIndexService(registry, dataSource, QueryEngineProperties(enabled = true, tailIntervalMs = 5))
        fun awaitTails(n: Int) {
            val deadline = System.currentTimeMillis() + 20_000
            while (tails.get() < n && System.currentTimeMillis() < deadline) Thread.sleep(5)
            assertThat(tails.get(), greaterThanOrEqualTo(n))
        }
        try {
            service.start()
            awaitTails(20)
            assertThat("no reload while the rebuild runs", loads.get(), equalTo(1))
            assertThat(service.get("test"), notNullValue())

            rebuilding.set(false)
            awaitTails(tails.get() + 20)
            assertThat("one reload after the rebuild", loads.get(), equalTo(2))
            assertThat(service.get("test"), notNullValue())
        } finally {
            service.destroy()
        }
    }

    @Test
    fun `a request during a reload waits for it and is then served`() {
        val release = CountDownLatch(1)
        val loads = AtomicInteger()
        val service = service(reloadingDataSource(loads) { if (it == 2) release.await() })
        try {
            service.start()
            awaitReloadStarted(service, loads)
            val request = CompletableFuture.supplyAsync { service.forRequest("test") }
            Thread.sleep(300)
            assertThat("the request waits for the reload", request.isDone, equalTo(false))
            release.countDown()
            assertThat(request.get(10, TimeUnit.SECONDS), instanceOf(IndexLookup.Ready::class.java))
            assertThat(loads.get(), equalTo(2))
        } finally {
            release.countDown()
            service.destroy()
        }
    }

    @Test
    fun `a request that waits longer than reload-wait-ms for a reload gets a 503`() {
        val release = CountDownLatch(1)
        val loads = AtomicInteger()
        val service = service(reloadingDataSource(loads) { if (it == 2) release.await() }, reloadWaitMs = 300)
        try {
            service.start()
            awaitReloadStarted(service, loads)
            val started = System.currentTimeMillis()
            val lookup = service.forRequest("test")
            assertThat(System.currentTimeMillis() - started, greaterThanOrEqualTo(300L))
            assertThat((lookup as IndexLookup.Unavailable).reason, containsString("being reloaded"))
        } finally {
            release.countDown()
            service.destroy()
        }
    }

    @Test
    fun `a failed reload releases waiting requests at once with a 503`() {
        val release = CountDownLatch(1)
        val loads = AtomicInteger()
        val dataSource = reloadingDataSource(loads) {
            if (it == 2) {
                release.await()
                throw SQLException("test")
            }
        }
        val service = service(dataSource)
        try {
            service.start()
            awaitReloadStarted(service, loads)
            val request = CompletableFuture.supplyAsync { service.forRequest("test") }
            Thread.sleep(300)
            assertThat(request.isDone, equalTo(false))
            release.countDown()
            val lookup = request.get(5, TimeUnit.SECONDS)
            assertThat((lookup as IndexLookup.Unavailable).reason, containsString("failed"))

            // until the retry (after a 1 s backoff) starts, requests get the 503 without waiting
            val started = System.currentTimeMillis()
            assertThat(service.forRequest("test"), instanceOf(IndexLookup.Unavailable::class.java))
            assertThat(System.currentTimeMillis() - started, lessThan(500L))

            // the retry succeeds, and requests are served again
            val deadline = System.currentTimeMillis() + 20_000
            while (service.get("test") == null && System.currentTimeMillis() < deadline) Thread.sleep(5)
            assertThat(service.forRequest("test"), instanceOf(IndexLookup.Ready::class.java))
        } finally {
            release.countDown()
            service.destroy()
        }
    }

    @Test
    fun `a request during the first load waits for it`() {
        val release = CountDownLatch(1)
        val loads = AtomicInteger()
        val service = service(reloadingDataSource(loads) { if (it == 1) release.await() })
        try {
            service.start()
            val request = CompletableFuture.supplyAsync { service.forRequest("test") }
            Thread.sleep(300)
            assertThat(request.isDone, equalTo(false))
            release.countDown()
            assertThat(request.get(10, TimeUnit.SECONDS), instanceOf(IndexLookup.Ready::class.java))
        } finally {
            release.countDown()
            service.destroy()
        }
    }

    @Test
    fun `a changelog that ends below the applied seq triggers one reload`() {
        val loads = AtomicInteger()
        val tails = AtomicInteger()
        val truncated = AtomicBoolean(false)
        val dataSource = fakeDataSource { sql ->
            when {
                // the first load sees seq 1, the reload an empty changelog
                "coalesce(max(seq), 0) from query_changelog" in sql -> {
                    loads.incrementAndGet()
                    rows(if (truncated.get()) 0 else 1)
                }

                "order by seq limit" in sql -> {
                    tails.incrementAndGet()
                    rows(0)
                }

                // Postgres's max() over no rows is one NULL row
                "select max(seq) from query_changelog" in sql -> rows(1, nulls = truncated.get())

                else -> rows(0)
            }
        }
        val service = service(dataSource)
        try {
            service.start()
            awaitCount(tails, 20)
            assertThat("no reload while the changelog ends at the applied seq", loads.get(), equalTo(1))

            truncated.set(true)
            awaitCount(tails, tails.get() + 20)
            assertThat(loads.get(), equalTo(2))
            assertThat(service.get("test"), notNullValue())
        } finally {
            service.destroy()
        }
    }

    @Test
    fun `an organism whose updates fail for longer than the threshold answers 503 until they work again`() {
        val tails = AtomicInteger()
        val failing = AtomicBoolean(false)
        val dataSource = fakeDataSource { sql ->
            when {
                "order by seq limit" in sql -> {
                    tails.incrementAndGet()
                    if (failing.get()) throw SQLException("test")
                    rows(0)
                }

                else -> rows(0)
            }
        }
        val service = service(dataSource, staleAfterTailFailureMs = 500)
        try {
            service.start()
            awaitCount(tails, 1)
            failing.set(true)
            val failingFrom = System.currentTimeMillis()
            awaitCount(tails, tails.get() + 5)
            if (System.currentTimeMillis() - failingFrom < 400) {
                assertThat("not yet past the threshold", service.forRequest("test"), instanceOf(Ready::class.java))
            }

            val stale = awaitLookup(service, Unavailable::class.java) as Unavailable
            assertThat(System.currentTimeMillis() - failingFrom, greaterThanOrEqualTo(500L))
            assertThat(stale.reason, containsString("cannot be updated"))

            failing.set(false)
            awaitLookup(service, Ready::class.java)
        } finally {
            service.destroy()
        }
    }

    @Test
    fun `update failures shorter than the threshold are invisible to requests`() {
        val tails = AtomicInteger()
        val failing = AtomicBoolean(false)
        val dataSource = fakeDataSource { sql ->
            when {
                "order by seq limit" in sql -> {
                    tails.incrementAndGet()
                    if (failing.get()) throw SQLException("test")
                    rows(0)
                }

                else -> rows(0)
            }
        }
        val service = service(dataSource, staleAfterTailFailureMs = 1_500)
        fun assertServedFor(ms: Long) {
            val until = System.currentTimeMillis() + ms
            while (System.currentTimeMillis() < until) {
                assertThat(service.forRequest("test"), instanceOf(Ready::class.java))
                Thread.sleep(5)
            }
        }
        try {
            service.start()
            awaitCount(tails, 1)
            failing.set(true)
            awaitCount(tails, tails.get() + 5)
            assertServedFor(500)
            failing.set(false)
            awaitCount(tails, tails.get() + 5)
            // a second blip: its clock starts afresh, so 0.5 s + 1 s of failures never add up to the 1.5 s threshold
            failing.set(true)
            assertServedFor(1_000)
            failing.set(false)
            assertServedFor(1_000)
        } finally {
            service.destroy()
        }
    }

    @Test
    fun `readiness is out of service until every organism's index is loaded`() {
        val service = mockk<QueryIndexService>()
        val provider = mockk<ObjectProvider<QueryIndexService>> { every { ifAvailable } returns service }
        val indicator = QueryIndexHealthIndicator(provider)

        every { service.organismsNotLoaded() } returns listOf("test")
        val loading = indicator.health()
        assertThat(loading.status, equalTo(Status.OUT_OF_SERVICE))
        assertThat(loading.details["loading"], equalTo(listOf("test")))

        every { service.organismsNotLoaded() } returns emptyList()
        assertThat(indicator.health().status, equalTo(Status.UP))
    }

    @Test
    fun `readiness is up when the query engine is disabled`() {
        val provider = mockk<ObjectProvider<QueryIndexService>> { every { ifAvailable } returns null }
        assertThat(QueryIndexHealthIndicator(provider).health().status, equalTo(Status.UP))
    }

    private fun service(dataSource: DataSource, reloadWaitMs: Long = 30_000, staleAfterTailFailureMs: Long = 120_000) =
        QueryIndexService(
            registry,
            dataSource,
            QueryEngineProperties(
                enabled = true,
                tailIntervalMs = 5,
                reloadWaitMs = reloadWaitMs,
                staleAfterTailFailureMs = staleAfterTailFailureMs,
            ),
        )

    private fun awaitCount(counter: AtomicInteger, n: Int) {
        val deadline = System.currentTimeMillis() + 20_000
        while (counter.get() < n && System.currentTimeMillis() < deadline) Thread.sleep(5)
        assertThat(counter.get(), greaterThanOrEqualTo(n))
    }

    private fun awaitLookup(service: QueryIndexService, type: Class<out IndexLookup>): IndexLookup {
        val deadline = System.currentTimeMillis() + 10_000
        while (true) {
            val lookup = service.forRequest("test")
            if (type.isInstance(lookup) || System.currentTimeMillis() > deadline) {
                assertThat(lookup, instanceOf(type))
                return lookup
            }
            Thread.sleep(5)
        }
    }

    /**
     * a DataSource whose first load is followed by a changelog backlog that triggers a reload; [onLoad] runs at the
     * start of every full load with its number (1 = the first load), after [loads] was incremented
     */
    private fun reloadingDataSource(loads: AtomicInteger, onLoad: (Int) -> Unit) = fakeDataSource { sql ->
        when {
            "coalesce(max(seq), 0) from query_changelog" in sql -> {
                onLoad(loads.incrementAndGet())
                rows(0)
            }

            "order by seq limit" in sql && loads.get() == 1 -> rows(QueryIndexService.REBUILD_MIN_CHANGES + 1)

            "count(distinct id)" in sql -> rows(1)

            else -> rows(0)
        }
    }

    /** waits until the reload (load 2) has dropped the index and started */
    private fun awaitReloadStarted(service: QueryIndexService, loads: AtomicInteger) {
        val deadline = System.currentTimeMillis() + 20_000
        while ((loads.get() < 2 || service.get("test") != null) && System.currentTimeMillis() < deadline) {
            Thread.sleep(5)
        }
        assertThat(loads.get(), equalTo(2))
        assertThat(service.get("test"), nullValue())
    }

    /** a DataSource whose statements return [result] of their SQL (throwing there fails the statement) */
    private fun fakeDataSource(result: (String) -> ResultSet): DataSource {
        val connection = mockk<Connection>(relaxed = true) {
            every { prepareStatement(any()) } answers {
                val sql = firstArg<String>()
                mockk<PreparedStatement>(relaxed = true) { every { executeQuery() } answers { result(sql) } }
            }
        }
        return mockk { every { this@mockk.connection } returns connection }
    }

    /**
     * a result set of [n] rows in which every int/long column of row i is i (SQL NULL if [nulls]), and every boolean
     * column [flag]
     */
    private fun rows(n: Int, flag: Boolean = false, nulls: Boolean = false): ResultSet {
        var row = 0
        return Proxy.newProxyInstance(javaClass.classLoader, arrayOf(ResultSet::class.java)) { _, method, _ ->
            when (method.name) {
                "next" -> ++row <= n
                "getLong" -> row.toLong()
                "getInt" -> row
                "getBoolean" -> flag
                "wasNull" -> nulls
                else -> null
            }
        } as ResultSet
    }
}
