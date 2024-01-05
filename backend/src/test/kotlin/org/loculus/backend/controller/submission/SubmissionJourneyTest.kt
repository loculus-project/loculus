package org.loculus.backend.controller.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.Status.APPROVED_FOR_RELEASE
import org.loculus.backend.api.Status.AWAITING_APPROVAL
import org.loculus.backend.api.Status.HAS_ERRORS
import org.loculus.backend.api.Status.IN_PROCESSING
import org.loculus.backend.api.Status.RECEIVED
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class SubmissionJourneyTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {
    @Test
    fun `Submission scenario, from submission, over edit and approval ending in status 'APPROVED_FOR_RELEASE'`() {
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

        convenienceClient.submitDefaultEditedData()
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

    @Test
    fun `Release journey scenario for two organisms`() {
        val defaultOrganismData = convenienceClient.submitDefaultFiles(organism = DEFAULT_ORGANISM)
        val otherOrganismData = convenienceClient.submitDefaultFiles(organism = OTHER_ORGANISM)

        convenienceClient.extractUnprocessedData(organism = DEFAULT_ORGANISM)
        convenienceClient.extractUnprocessedData(organism = OTHER_ORGANISM)

        convenienceClient.submitProcessedData(
            *defaultOrganismData.map {
                PreparedProcessedData.successfullyProcessed(accession = it.accession, version = it.version)
            }.toTypedArray(),
            organism = DEFAULT_ORGANISM,
        )
        convenienceClient.submitProcessedData(
            *otherOrganismData.map {
                PreparedProcessedData.successfullyProcessedOtherOrganismData(
                    accession = it.accession,
                    version = it.version,
                )
            }.toTypedArray(),
            organism = OTHER_ORGANISM,
        )

        convenienceClient.approveProcessedSequenceEntries(
            defaultOrganismData.map {
                AccessionVersion(
                    it.accession,
                    it.version,
                )
            },
            organism = DEFAULT_ORGANISM,
        )
        convenienceClient.approveProcessedSequenceEntries(
            otherOrganismData.map {
                AccessionVersion(
                    it.accession,
                    it.version,
                )
            },
            organism = OTHER_ORGANISM,
        )

        val defaultOrganismReleasedData = convenienceClient.getReleasedData(organism = DEFAULT_ORGANISM)
        val otherOrganismReleasedData = convenienceClient.getReleasedData(organism = OTHER_ORGANISM)

        assertThat(defaultOrganismReleasedData.size, `is`(DefaultFiles.NUMBER_OF_SEQUENCES))
        assertThat(otherOrganismReleasedData.size, `is`(DefaultFiles.NUMBER_OF_SEQUENCES))

        val defaultOrganismAccessionVersions = getAccessionVersionsOfProcessedData(defaultOrganismReleasedData)
        val otherOrganismAccessionVersions = getAccessionVersionsOfProcessedData(otherOrganismReleasedData)

        assertThat(
            defaultOrganismAccessionVersions,
            containsInAnyOrder(*getAccessionVersions(defaultOrganismData).toTypedArray()),
        )
        assertThat(
            otherOrganismAccessionVersions,
            containsInAnyOrder(*getAccessionVersions(otherOrganismData).toTypedArray()),
        )
        assertThat(
            defaultOrganismAccessionVersions.intersect(getAccessionVersions(otherOrganismData).toSet()),
            `is`(empty()),
        )
        assertThat(
            otherOrganismAccessionVersions.intersect(getAccessionVersions(defaultOrganismData).toSet()),
            `is`(empty()),
        )
    }

    private fun getAccessionVersionsOfProcessedData(processedData: List<ProcessedData>) = processedData
        .map { it.metadata }
        .map { it["accessionVersion"]!!.asText() }

    private fun getAccessionVersions(sequenceEntryVersions: List<AccessionVersionInterface>) =
        sequenceEntryVersions.map { it.displayAccessionVersion() }
}
