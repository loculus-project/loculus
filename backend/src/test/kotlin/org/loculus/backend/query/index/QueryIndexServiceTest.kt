package org.loculus.backend.query.index

import io.mockk.every
import io.mockk.mockk
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.everyItem
import org.hamcrest.Matchers.greaterThanOrEqualTo
import org.hamcrest.Matchers.notNullValue
import org.junit.jupiter.api.Test
import org.loculus.backend.query.QueryEngineProperties
import org.loculus.backend.query.QuerySchemaRegistry
import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.health.contributor.Status
import java.lang.reflect.Proxy
import java.sql.Connection
import java.sql.PreparedStatement
import java.sql.ResultSet
import java.sql.SQLException
import java.util.concurrent.CopyOnWriteArrayList
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

    /** a result set of [n] rows in which every int/long column of row i is i */
    private fun rows(n: Int): ResultSet {
        var row = 0
        return Proxy.newProxyInstance(javaClass.classLoader, arrayOf(ResultSet::class.java)) { _, method, _ ->
            when (method.name) {
                "next" -> ++row <= n
                "getLong" -> row.toLong()
                "getInt" -> row
                "wasNull" -> false
                else -> null
            }
        } as ResultSet
    }
}
