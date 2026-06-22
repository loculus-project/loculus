package org.loculus.backend.service.submission

import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.service.scheduler.TaskLockService
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.TimeUnit

private val log = mu.KotlinLogging.logger {}

const val USE_NEWER_PROCESSING_PIPELINE_VERSION_TASK_NAME = "use-newer-processing-pipeline-version"

@Component
class UseNewerProcessingPipelineVersionTask(
    private val submissionDatabaseService: SubmissionDatabaseService,
    private val taskLockService: TaskLockService,
    @Value(
        "\${${BackendSpringProperty.PIPELINE_VERSION_UPGRADE_CHECK_INTERVAL_SECONDS}}",
    ) private val lockIntervalSeconds: Long,
) {

    // Initial delay to avoid hammering the database on backend startup
    @Scheduled(
        initialDelayString =
        "#{T(java.lang.Math).min(" +
            "\${${BackendSpringProperty.PIPELINE_VERSION_UPGRADE_CHECK_INTERVAL_SECONDS}}, 600)}",
        fixedDelayString = "\${${BackendSpringProperty.PIPELINE_VERSION_UPGRADE_CHECK_INTERVAL_SECONDS}}",
        timeUnit = TimeUnit.SECONDS,
    )
    fun task() {
        if (!taskLockService.acquireLock(
                USE_NEWER_PROCESSING_PIPELINE_VERSION_TASK_NAME,
                frequencyIntervalSeconds = lockIntervalSeconds,
            )
        ) {
            return
        }
        try {
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
        } finally {
            taskLockService.releaseLock(
                USE_NEWER_PROCESSING_PIPELINE_VERSION_TASK_NAME,
                frequencyIntervalSeconds = lockIntervalSeconds,
            )
        }
    }
}
