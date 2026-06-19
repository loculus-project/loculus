package org.loculus.backend.service.submission

import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.junit.jupiter.api.Test
import org.loculus.backend.config.BackendSpringProperty
import org.springframework.core.env.MapPropertySource
import org.springframework.core.env.StandardEnvironment

/**
 * Verifies the placeholder strings compiled into the `@SchedulerLock` annotations resolve as
 * intended. The DB-backed [ShedLockIntegrationTest] always runs with `atLeast` overridden to PT0S,
 * so it cannot exercise the production default; this lightweight test covers that path.
 */
class ShedLockPropertyResolutionTest {

    // Must mirror the lockAtLeastFor string in UseNewerProcessingPipelineVersionTask exactly.
    private val pipelineLockAtLeast =
        "\${loculus.locks.useNewerProcessingPipelineVersion.atLeast:" +
            "PT\${${BackendSpringProperty.PIPELINE_VERSION_UPGRADE_CHECK_INTERVAL_SECONDS}}S}"

    private fun resolve(expression: String, props: Map<String, Any>): String {
        val env = StandardEnvironment()
        env.propertySources.addFirst(MapPropertySource("test", props))
        return env.resolvePlaceholders(expression)
    }

    @Test
    fun `WHEN no lock override is set THEN lockAtLeastFor falls back to the configured interval`() {
        val resolved = resolve(
            pipelineLockAtLeast,
            mapOf(BackendSpringProperty.PIPELINE_VERSION_UPGRADE_CHECK_INTERVAL_SECONDS to "3"),
        )
        assertThat(resolved, `is`("PT3S"))
    }

    @Test
    fun `WHEN a lock override is set THEN it takes precedence over the interval default`() {
        val resolved = resolve(
            pipelineLockAtLeast,
            mapOf(
                BackendSpringProperty.PIPELINE_VERSION_UPGRADE_CHECK_INTERVAL_SECONDS to "3",
                "loculus.locks.useNewerProcessingPipelineVersion.atLeast" to "PT0S",
            ),
        )
        assertThat(resolved, `is`("PT0S"))
    }
}
