package org.pathoplexus.backend.controller

import org.junit.jupiter.api.Test
import org.pathoplexus.backend.api.SequenceVersion
import org.pathoplexus.backend.api.Status.NEEDS_REVIEW
import org.pathoplexus.backend.api.Status.PROCESSED
import org.pathoplexus.backend.api.Status.PROCESSING
import org.pathoplexus.backend.api.Status.RECEIVED
import org.pathoplexus.backend.api.Status.REVIEWED
import org.pathoplexus.backend.api.Status.SILO_READY
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class SubmissionJourneyTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {
    @Test
    fun `Submission scenario, from submission, over review and approval ending in status 'SILO_READY'`() {
        convenienceClient.submitDefaultFiles()
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 1)
            .assertStatusIs(RECEIVED)

        convenienceClient.extractUnprocessedData()
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 1)
            .assertStatusIs(PROCESSING)

        convenienceClient.submitProcessedData(
            *DefaultFiles.allSequenceIds.map {
                PreparedProcessedData.withErrors(sequenceId = it)
            }.toTypedArray(),
        )
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 1)
            .assertStatusIs(NEEDS_REVIEW)

        convenienceClient.submitDefaultReviewedData()
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 1)
            .assertStatusIs(REVIEWED)

        convenienceClient.extractUnprocessedData()
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 1)
            .assertStatusIs(PROCESSING)

        convenienceClient.submitProcessedData(
            *DefaultFiles.allSequenceIds.map {
                PreparedProcessedData.successfullyProcessed(sequenceId = it)
            }.toTypedArray(),
        )
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 1)
            .assertStatusIs(PROCESSED)

        convenienceClient.approveProcessedSequences(DefaultFiles.allSequenceIds.map { SequenceVersion(it, 1) })
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 1)
            .assertStatusIs(SILO_READY)
    }

    @Test
    fun `Revising scenario, from submitting revised data over processing, approving ending in status 'SILO_READY'`() {
        convenienceClient.prepareDefaultSequencesToSiloReady()

        convenienceClient.reviseDefaultProcessedSequences()
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 2)
            .assertStatusIs(RECEIVED)

        convenienceClient.extractUnprocessedData()
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 2)
            .assertStatusIs(PROCESSING)

        convenienceClient.submitProcessedData(
            *DefaultFiles.allSequenceIds.map {
                PreparedProcessedData.successfullyProcessed(sequenceId = it, version = 2)
            }.toTypedArray(),
        )
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 2)
            .assertStatusIs(PROCESSED)

        convenienceClient.approveProcessedSequences(DefaultFiles.allSequenceIds.map { SequenceVersion(it, 2) })
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 2)
            .assertStatusIs(SILO_READY)
    }
}
