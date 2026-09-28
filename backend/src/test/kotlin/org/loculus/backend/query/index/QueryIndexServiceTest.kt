package org.loculus.backend.query.index

import io.mockk.every
import io.mockk.mockk
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThanOrEqualTo
import org.junit.jupiter.api.Test
import org.loculus.backend.query.QueryEngineProperties
import org.loculus.backend.query.QuerySchemaRegistry
import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.health.contributor.Status
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
}
