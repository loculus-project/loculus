package org.loculus.backend.service.submission

import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.TimeUnit

private val log = mu.KotlinLogging.logger {}

@Component
class UseNewerProcessingPipelineVersionTask(
    private val submissionDatabaseService: SubmissionDatabaseService,
) {

    @Scheduled(fixedDelay = 10, timeUnit = TimeUnit.SECONDS)
    fun task() {
        val newVersion = submissionDatabaseService.useNewerProcessingPipelineIfPossible()
        if (newVersion != null) {
            log.info { "New processing pipeline was deployed: version $newVersion" }
        }
    }
}
