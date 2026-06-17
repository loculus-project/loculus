package org.loculus.backend.service.submission

import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.junit.jupiter.api.Test
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.EndpointTest
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate

@EndpointTest(
    properties = [
        "${BackendSpringProperty.STALE_AFTER_SECONDS}=0",
        "${BackendSpringProperty.CLEAN_UP_RUN_EVERY_SECONDS}=3600",
    ],
)
class ShedLockIntegrationTest(
    @Autowired val jdbcTemplate: JdbcTemplate,
    @Autowired val cleanUpStaleSequencesInProcessingTask: CleanUpStaleSequencesInProcessingTask,
) {
    @Test
    fun `WHEN task is called through the Spring proxy THEN shedlock row is created`() {
        cleanUpStaleSequencesInProcessingTask.task()

        val count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM shedlock WHERE name = ?",
            Int::class.java,
            "cleanUpStaleSequencesInProcessing",
        )
        assertThat(count, `is`(1))
    }
}
