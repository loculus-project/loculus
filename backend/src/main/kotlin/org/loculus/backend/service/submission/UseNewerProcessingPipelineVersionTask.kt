package org.loculus.backend.service.submission

import org.loculus.backend.config.BackendSpringProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.TimeUnit

private val log = mu.KotlinLogging.logger {}

@Component
class UseNewerProcessingPipelineVersionTask(private val submissionDatabaseService: SubmissionDatabaseService) {

    @Scheduled(
        // Initial delay to avoid hammering the database on backend startup
        initialDelayString =
        "#{T(java.lang.Math).min(" +
            "\${${BackendSpringProperty.PIPELINE_VERSION_UPGRADE_CHECK_INTERVAL_SECONDS}}, 600)}",
        fixedDelayString = "\${${BackendSpringProperty.PIPELINE_VERSION_UPGRADE_CHECK_INTERVAL_SECONDS}}",
        timeUnit = TimeUnit.SECONDS,
    )
    fun task() {
        upgradeProcessingPipelineTask()
        cleanUpOutdatedProcessingDataTask()
    }


    private fun upgradeProcessingPipelineTask() {
        log.info { "Starting checking for processing pipeline version upgrades" }
        val startTime = System.currentTimeMillis()
        submissionDatabaseService.useNewerProcessingPipelineIfPossible()
        log.info { "Finished checking for processing pipeline version upgrades in ${System.currentTimeMillis() - startTime} ms" }
    }

    private fun cleanUpOutdatedProcessingDataTask() {
        log.info { "Starting cleanup of outdated preprocessing data" }
        val cleanupStartTime = System.currentTimeMillis()
        submissionDatabaseService.cleanUpOutdatedPreprocessingData(numberOfStaleVersionsToKeep = BackendSpringProperty.STALE_PIPELINE_VERSIONS_TO_KEEP)
        log.info { "Finished cleanup of outdated preprocessing data in ${System.currentTimeMillis() - cleanupStartTime} ms" }
    }
}
