package org.loculus.backend.service.submission

import com.ninjasquad.springmockk.MockkSpyBean
import io.mockk.every
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.utils.DateProvider
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import kotlin.time.Clock
import kotlin.time.Duration.Companion.hours

@EndpointTest
class RateLimitAlertNotifierTest(
    @Autowired private val notifier: RateLimitAlertNotifier,
    @Autowired private val transactionManager: PlatformTransactionManager,
) {
    @MockkSpyBean
    lateinit var dateProvider: DateProvider

    private fun notify(key: String = "shared", threshold: Int = 80) = notifier.notify(key, "shared", threshold, 12, 15)

    @Test
    fun `GIVEN an alert was sent THEN it is not repeated within 24 hours but is afterwards`() {
        val start = Clock.System.now()
        every { dateProvider.getCurrentInstant() } returns start
        assertTrue(notify())
        assertFalse(notify())
        assertTrue(notify(threshold = 100))
        assertTrue(notify(key = "group:4"))

        every { dateProvider.getCurrentInstant() } returns start + 23.hours
        assertFalse(notify())
        every { dateProvider.getCurrentInstant() } returns start + 25.hours
        assertTrue(notify())
    }

    @Test
    fun `GIVEN the calling transaction rolls back THEN the alert stays recorded`() {
        assertThrows<IllegalStateException> {
            TransactionTemplate(transactionManager).execute {
                assertTrue(notify(threshold = 100))
                throw IllegalStateException("request rejected")
            }
        }
        assertFalse(notify(threshold = 100))
    }
}
