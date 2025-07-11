package org.loculus.backend.service.submission

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

    @Scheduled(fixedDelay = 10, timeUnit = TimeUnit.SECONDS)
    fun task() {
        val newVersions = submissionDatabaseService.useNewerProcessingPipelineIfPossible()

        newVersions.forEach { (organism, latestVersion) ->
            if (latestVersion != null) {
                submissionDatabaseService.cleanUpOutdatedPreprocessingData(organism, latestVersion - 1)
            }
        }
    }
}
