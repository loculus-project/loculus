package org.pathoplexus.backend.controller

import org.junit.jupiter.api.Test
import org.pathoplexus.backend.api.AccessionVersion
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
        convenienceClient.getSequenceEntryOfUser(accession = DefaultFiles.firstAccession, version = 1)
            .assertStatusIs(RECEIVED)

        convenienceClient.extractUnprocessedData()
        convenienceClient.getSequenceEntryOfUser(accession = DefaultFiles.firstAccession, version = 1)
            .assertStatusIs(IN_PROCESSING)

        convenienceClient.submitProcessedData(
            *DefaultFiles.allAccessions.map {
                PreparedProcessedData.withErrors(accession = it)
            }.toTypedArray(),
        )
        convenienceClient.getSequenceEntryOfUser(accession = DefaultFiles.firstAccession, version = 1)
            .assertStatusIs(HAS_ERRORS)

        convenienceClient.submitDefaultReviewedData()
        convenienceClient.getSequenceEntryOfUser(accession = DefaultFiles.firstAccession, version = 1)
            .assertStatusIs(RECEIVED)

        convenienceClient.extractUnprocessedData()
        convenienceClient.getSequenceEntryOfUser(accession = DefaultFiles.firstAccession, version = 1)
            .assertStatusIs(IN_PROCESSING)

        convenienceClient.submitProcessedData(
            *DefaultFiles.allAccessions.map {
                PreparedProcessedData.successfullyProcessed(accession = it)
            }.toTypedArray(),
        )
        convenienceClient.getSequenceEntryOfUser(accession = DefaultFiles.firstAccession, version = 1)
            .assertStatusIs(AWAITING_APPROVAL)

        convenienceClient.approveProcessedSequenceEntries(DefaultFiles.allAccessions.map { AccessionVersion(it, 1) })
        convenienceClient.getSequenceEntryOfUser(accession = DefaultFiles.firstAccession, version = 1)
            .assertStatusIs(APPROVED_FOR_RELEASE)
    }

    @Test
    fun `Revising, from submitting revised data over processing, approving ending in status 'APPROVED_FOR_RELEASE'`() {
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()

        convenienceClient.reviseDefaultProcessedSequenceEntries()
        convenienceClient.getSequenceEntryOfUser(accession = DefaultFiles.firstAccession, version = 2)
            .assertStatusIs(RECEIVED)

        convenienceClient.extractUnprocessedData()
        convenienceClient.getSequenceEntryOfUser(accession = DefaultFiles.firstAccession, version = 2)
            .assertStatusIs(IN_PROCESSING)

        convenienceClient.submitProcessedData(
            *DefaultFiles.allAccessions.map {
                PreparedProcessedData.successfullyProcessed(accession = it, version = 2)
            }.toTypedArray(),
        )
        convenienceClient.getSequenceEntryOfUser(accession = DefaultFiles.firstAccession, version = 2)
            .assertStatusIs(AWAITING_APPROVAL)

        convenienceClient.approveProcessedSequenceEntries(DefaultFiles.allAccessions.map { AccessionVersion(it, 2) })
        convenienceClient.getSequenceEntryOfUser(accession = DefaultFiles.firstAccession, version = 2)
            .assertStatusIs(APPROVED_FOR_RELEASE)
    }
}
