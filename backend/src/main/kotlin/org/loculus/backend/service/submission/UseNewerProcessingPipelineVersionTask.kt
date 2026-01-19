package org.loculus.backend.service.submission

import org.loculus.backend.config.BackendSpringProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.TimeUnit

private val log = mu.KotlinLogging.logger {}

@Component
class UseNewerProcessingPipelineVersionTask(private val submissionDatabaseService: SubmissionDatabaseService) {

    // Initial delay to avoid hammering the database on backend startup
    @Scheduled(
        initialDelayString =
        "#{T(java.lang.Math).min(" +
            "\${${BackendSpringProperty.PIPELINE_VERSION_UPGRADE_CHECK_INTERVAL_SECONDS}}, 600)}",
        fixedDelayString = "\${${BackendSpringProperty.PIPELINE_VERSION_UPGRADE_CHECK_INTERVAL_SECONDS}}",
        timeUnit = TimeUnit.SECONDS,
    )
    fun task() {
        log.info { "Checking for newer preprocessing pipeline versions" }
        val newVersions = submissionDatabaseService.useNewerProcessingPipelineIfPossible()

        newVersions.forEach { (organism, latestVersion) ->
            if (latestVersion != null) {
                submissionDatabaseService.cleanUpOutdatedPreprocessingData(organism, latestVersion - 1)
            }
        }

        val upgradedOrganisms = newVersions.filterValues { it != null }
        if (upgradedOrganisms.isNotEmpty()) {
            log.info { "Completed pipeline version upgrade check: upgraded ${upgradedOrganisms.size} organism(s)" }
        } else {
            log.debug { "Completed pipeline version upgrade check: no upgrades needed" }
        }
    }
}
