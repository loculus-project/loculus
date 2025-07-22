package org.loculus.backend.service.submission

import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.log.AuditLogger
import org.springframework.beans.factory.annotation.Value
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
        fixedRateString = "\${${BackendSpringProperty.USE_NEWER_PIPELINE_RUN_EVERY_SECONDS}}",
        timeUnit = TimeUnit.SECONDS,
    )
    fun task() {
        submissionDatabaseService.useNewerProcessingPipelineIfPossible()
        submissionDatabaseService.cleanUpOutdatedPreprocessingDataForAllOrganisms()
    }
}
