package org.loculus.backend.service.submission

import net.javacrumbs.shedlock.core.LockConfiguration
import net.javacrumbs.shedlock.core.LockProvider
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.junit.jupiter.api.Test
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.EndpointTest
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import java.time.Duration
import java.time.Instant

@EndpointTest(
    properties = [
        "${BackendSpringProperty.STALE_AFTER_SECONDS}=0",
        "${BackendSpringProperty.CLEAN_UP_RUN_EVERY_SECONDS}=3600",
    ],
)
class ShedLockIntegrationTest(
    @Autowired val jdbcTemplate: JdbcTemplate,
    @Autowired val lockProvider: LockProvider,
    @Autowired val cleanUpStaleSequencesInProcessingTask: CleanUpStaleSequencesInProcessingTask,
) {
    @Test
    fun `WHEN a scheduled task is invoked through the Spring proxy THEN a shedlock row is created`() {
        cleanUpStaleSequencesInProcessingTask.task()

        val count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM shedlock WHERE name = ?",
            Int::class.java,
            "cleanUpStaleSequencesInProcessing",
        )
        assertThat(count, `is`(1))
    }

    @Test
    fun `WHEN a lock is released within lockAtLeastFor THEN it cannot be re-acquired yet`() {
        // A unique lock name no scheduled task uses, so the background scheduler can't interfere.
        val lockName = "shedLockIntegrationTestLock"
        val lockAtMostFor = Duration.ofMinutes(5)
        val lockAtLeastFor = Duration.ofMinutes(1)

        val firstLock = lockProvider.lock(
            LockConfiguration(Instant.now(), lockName, lockAtMostFor, lockAtLeastFor),
        )
        assertThat("the lock should be acquired when free", firstLock.isPresent, `is`(true))

        // Release immediately - because lockAtLeastFor has not elapsed, the lock stays held.
        firstLock.get().unlock()

        val secondLock = lockProvider.lock(
            LockConfiguration(Instant.now(), lockName, lockAtMostFor, lockAtLeastFor),
        )
        assertThat(
            "re-acquisition within lockAtLeastFor should be refused",
            secondLock.isPresent,
            `is`(false),
        )
    }
}
