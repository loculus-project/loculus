package org.loculus.backend.service.submission

import org.loculus.backend.config.BackendSpringProperty.CHECK_PREPRO_PIPELINE_VERSION_UPGRADE_EVERY_SECONDS
import org.loculus.backend.log.AuditLogger
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.TimeUnit

private val log = mu.KotlinLogging.logger {}

@Component
class UseNewerProcessingPipelineVersionTask(
    private val submissionDatabaseService: SubmissionDatabaseService,
    private val auditLogger: AuditLogger,
) {

    @Scheduled(
        fixedDelayString = "\${${CHECK_PREPRO_PIPELINE_VERSION_UPGRADE_EVERY_SECONDS}:600}",
        timeUnit = TimeUnit.SECONDS,
    )
    fun task() {
        val newVersion = submissionDatabaseService.useNewerProcessingPipelineIfPossible()
        if (newVersion != null) {
            val logMessage = "Started using results from new processing pipeline: version $newVersion"
            log.info(logMessage)
            auditLogger.log(logMessage)
        } else {
            log.debug("No new processing pipeline version available")
        }
    }
}
