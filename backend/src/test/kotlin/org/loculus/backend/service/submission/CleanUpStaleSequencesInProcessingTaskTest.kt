package org.loculus.backend.service.submission

import kotlinx.datetime.LocalDateTime
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.`is`
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Status.IN_PROCESSING
import org.loculus.backend.api.Status.PROCESSED
import org.loculus.backend.api.Status.RECEIVED
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.getAccessionVersions
import org.loculus.backend.controller.submission.PreparedProcessedData
import org.loculus.backend.controller.submission.SubmissionControllerClient
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.util.UUID

@EndpointTest(
    properties = [
        "${BackendSpringProperty.STALE_AFTER_SECONDS}=60",
        "${BackendSpringProperty.CLEAN_UP_RUN_EVERY_SECONDS}=3600",
    ],
)
class CleanUpStaleSequencesInProcessingTaskTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val client: SubmissionControllerClient,
    @Autowired val cleanUpStaleSequencesInProcessingTask: CleanUpStaleSequencesInProcessingTask,
) {

    @Test
    fun `GIVEN sequences are stale in processing WHEN running clean up THEN reset sequences to received`() {
        convenienceClient.submitDefaultFiles()
        val firstClaim = convenienceClient.extractUnprocessedData()
        expire(firstClaim.first().processingAttemptId)

        assertThat(
            convenienceClient.getSequenceEntriesOfUserInState(status = IN_PROCESSING),
            hasSize(firstClaim.size),
        )

        cleanUpStaleSequencesInProcessingTask.task()

        assertThat(
            convenienceClient.getSequenceEntriesOfUserInState(status = RECEIVED),
            hasSize(firstClaim.size),
        )
        assertThat(convenienceClient.getSequenceEntriesOfUserInState(status = IN_PROCESSING), hasSize(0))

        val secondClaim = convenienceClient.extractUnprocessedData()
        assertThat(
            secondClaim.getAccessionVersions(),
            containsInAnyOrder(*firstClaim.getAccessionVersions().toTypedArray()),
        )
        assertThat(
            secondClaim.map { it.processingAttemptId }.toSet()
                .intersect(firstClaim.map { it.processingAttemptId }.toSet()),
            `is`(empty()),
        )
    }

    @Test
    fun `GIVEN a lease is active WHEN running clean up THEN keep the job in processing`() {
        convenienceClient.submitDefaultFiles()
        val claim = convenienceClient.extractUnprocessedData(numberOfSequenceEntries = 1).single()
        val leasesBefore = leasesFor(claim.processingAttemptId)

        cleanUpStaleSequencesInProcessingTask.task()

        convenienceClient.getSequenceEntry(claim.accession, claim.version)
            .assertStatusIs(IN_PROCESSING)
        assertThat(leasesFor(claim.processingAttemptId), `is`(leasesBefore))
    }

    @Test
    fun `GIVEN a job was reclaimed THEN result from the old attempt is rejected`() {
        convenienceClient.submitDefaultFiles()
        val firstClaim = convenienceClient.extractUnprocessedData(numberOfSequenceEntries = 1).single()
        expire(firstClaim.processingAttemptId)
        cleanUpStaleSequencesInProcessingTask.task()
        val secondClaim = convenienceClient.extractUnprocessedData(numberOfSequenceEntries = 1).single()

        client.submitProcessedData(resultFor(firstClaim))
            .andExpect(status().isUnprocessableEntity)
        convenienceClient.getSequenceEntry(secondClaim.accession, secondClaim.version)
            .assertStatusIs(IN_PROCESSING)

        client.submitProcessedData(resultFor(secondClaim))
            .andExpect(status().isNoContent)
        convenienceClient.getSequenceEntry(secondClaim.accession, secondClaim.version)
            .assertStatusIs(PROCESSED)
    }

    @Test
    fun `WHEN a shared attempt renews its lease THEN every job in the claimed batch is renewed`() {
        convenienceClient.submitDefaultFiles()
        val claim = convenienceClient.extractUnprocessedData(numberOfSequenceEntries = 2)
        val processingAttemptId = claim.map { it.processingAttemptId }.toSet().single()
        val leasesBefore = leasesFor(processingAttemptId)

        client.renewProcessingLease(processingAttemptId)
            .andExpect(status().isNoContent)

        val leasesAfter = leasesFor(processingAttemptId)
        assertThat(leasesAfter.size, `is`(2))
        assertThat(
            leasesAfter.zip(leasesBefore).all { (after, before) -> after > before },
            `is`(true),
        )
    }

    private fun expire(processingAttemptId: UUID) {
        transaction {
            SequenceEntriesPreprocessedDataTable.update(
                where = {
                    SequenceEntriesPreprocessedDataTable.processingAttemptIdColumn eq processingAttemptId
                },
            ) {
                it[leaseUntilColumn] = LocalDateTime.parse("2000-01-01T00:00:00")
            }
        }
    }

    private fun resultFor(claim: UnprocessedData) =
        PreparedProcessedData.successfullyProcessed(claim.accession, claim.version)
            .copy(processingAttemptId = claim.processingAttemptId)

    private fun leasesFor(processingAttemptId: UUID) = transaction {
        SequenceEntriesPreprocessedDataTable
            .select(SequenceEntriesPreprocessedDataTable.leaseUntilColumn)
            .where {
                SequenceEntriesPreprocessedDataTable.processingAttemptIdColumn eq processingAttemptId
            }
            .map { it[SequenceEntriesPreprocessedDataTable.leaseUntilColumn]!! }
    }
}
