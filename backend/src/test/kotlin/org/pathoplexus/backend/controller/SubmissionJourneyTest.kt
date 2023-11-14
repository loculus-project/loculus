package org.pathoplexus.backend.controller

import org.junit.jupiter.api.Test
import org.pathoplexus.backend.api.SequenceVersion
import org.pathoplexus.backend.api.Status.APPROVED_FOR_RELEASE
import org.pathoplexus.backend.api.Status.AWAITING_APPROVAL
import org.pathoplexus.backend.api.Status.HAS_ERRORS
import org.pathoplexus.backend.api.Status.IN_PROCESSING
import org.pathoplexus.backend.api.Status.RECEIVED
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class SubmissionJourneyTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {
    @Test
    fun `Submission scenario, from submission, over review and approval ending in status 'APPROVED_FOR_RELEASE'`() {
        convenienceClient.submitDefaultFiles()
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 1)
            .assertStatusIs(RECEIVED)

        convenienceClient.extractUnprocessedData()
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 1)
            .assertStatusIs(IN_PROCESSING)

        convenienceClient.submitProcessedData(
            *DefaultFiles.allSequenceIds.map {
                PreparedProcessedData.withErrors(sequenceId = it)
            }.toTypedArray(),
        )
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 1)
            .assertStatusIs(HAS_ERRORS)

        convenienceClient.submitDefaultReviewedData()
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 1)
            .assertStatusIs(RECEIVED)

        convenienceClient.extractUnprocessedData()
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 1)
            .assertStatusIs(IN_PROCESSING)

        convenienceClient.submitProcessedData(
            *DefaultFiles.allSequenceIds.map {
                PreparedProcessedData.successfullyProcessed(sequenceId = it)
            }.toTypedArray(),
        )
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 1)
            .assertStatusIs(AWAITING_APPROVAL)

        convenienceClient.approveProcessedSequences(DefaultFiles.allSequenceIds.map { SequenceVersion(it, 1) })
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 1)
            .assertStatusIs(APPROVED_FOR_RELEASE)
    }

    @Test
    fun `Revising, from submitting revised data over processing, approving ending in status 'APPROVED_FOR_RELEASE'`() {
        convenienceClient.prepareDefaultSequencesToApprovedForRelease()

        convenienceClient.reviseDefaultProcessedSequences()
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 2)
            .assertStatusIs(RECEIVED)

        convenienceClient.extractUnprocessedData()
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 2)
            .assertStatusIs(IN_PROCESSING)

        convenienceClient.submitProcessedData(
            *DefaultFiles.allSequenceIds.map {
                PreparedProcessedData.successfullyProcessed(sequenceId = it, version = 2)
            }.toTypedArray(),
        )
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 2)
            .assertStatusIs(AWAITING_APPROVAL)

        convenienceClient.approveProcessedSequences(DefaultFiles.allSequenceIds.map { SequenceVersion(it, 2) })
        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 2)
            .assertStatusIs(APPROVED_FOR_RELEASE)
    }
}
