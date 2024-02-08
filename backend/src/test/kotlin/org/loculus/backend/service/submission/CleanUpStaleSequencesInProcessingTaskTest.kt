package org.loculus.backend.service.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.hasSize
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Status.IN_PROCESSING
import org.loculus.backend.api.Status.RECEIVED
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest(
    properties = [
        "${BackendSpringProperty.STALE_AFTER_SECONDS}=0",
        "${BackendSpringProperty.CLEAN_UP_RUN_EVERY_SECONDS}=3600",
    ],
)
class CleanUpStaleSequencesInProcessingTaskTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val cleanUpStaleSequencesInProcessingTask: CleanUpStaleSequencesInProcessingTask,
) {

    @Test
    fun `GIVEN sequences are stale in processing WHEN running clean up THEN reset sequences to received`() {
        val submittedSequences = convenienceClient.prepareDataTo(IN_PROCESSING)

        assertThat(
            convenienceClient.getSequenceEntriesOfUserInState(status = IN_PROCESSING),
            hasSize(submittedSequences.size),
        )

        cleanUpStaleSequencesInProcessingTask.task()

        assertThat(
            convenienceClient.getSequenceEntriesOfUserInState(status = RECEIVED),
            hasSize(submittedSequences.size),
        )
        assertThat(convenienceClient.getSequenceEntriesOfUserInState(status = IN_PROCESSING), hasSize(0))
    }
}
