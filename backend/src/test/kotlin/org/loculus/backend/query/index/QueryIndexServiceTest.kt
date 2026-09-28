package org.loculus.backend.query.index

import io.mockk.every
import io.mockk.mockk
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.greaterThanOrEqualTo
import org.junit.jupiter.api.Test
import org.loculus.backend.query.QueryEngineProperties
import org.loculus.backend.query.QuerySchemaRegistry
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
}
