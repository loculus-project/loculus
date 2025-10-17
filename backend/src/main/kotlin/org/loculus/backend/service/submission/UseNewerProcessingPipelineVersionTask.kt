package org.loculus.backend.service.submission

import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.TimeUnit

@Component
class UseNewerProcessingPipelineVersionTask(private val submissionDatabaseService: SubmissionDatabaseService) {

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
