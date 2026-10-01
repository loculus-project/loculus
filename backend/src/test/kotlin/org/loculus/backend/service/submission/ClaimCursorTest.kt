package org.loculus.backend.service.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.Organism
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.springframework.beans.factory.annotation.Autowired

private const val FULL_SCAN_INTERVAL_SECONDS = 2L

@EndpointTest(properties = ["${BackendSpringProperty.CLAIM_FULL_SCAN_INTERVAL_SECONDS}=$FULL_SCAN_INTERVAL_SECONDS"])
class ClaimCursorTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val submissionDatabaseService: SubmissionDatabaseService,
) {
    private val organism = Organism(DEFAULT_ORGANISM)

    private fun claim(numberOfSequenceEntries: Int) = transaction {
        submissionDatabaseService.streamUnprocessedSubmissions(numberOfSequenceEntries, organism, 1)
            .map { AccessionVersion(it.accession, it.version) }
            .toList()
    }

    @Test
    fun `GIVEN a full scan found nothing THEN entries submitted afterwards are claimed by the next full scan`() {
        Thread.sleep(FULL_SCAN_INTERVAL_SECONDS * 1000 + 100)
        assertThat(claim(100), `is`(emptyList()))
        val submitted = convenienceClient.submitDefaultFiles().submissionIdMappings
            .map { AccessionVersion(it.accession, it.version) }
            .sortedWith(compareBy({ it.accession }, { it.version }))

        assertThat(claim(100), `is`(emptyList()))
        Thread.sleep(FULL_SCAN_INTERVAL_SECONDS * 1000 + 100)
        assertThat(claim(100), `is`(submitted))
    }

    @Test
    fun `claims continue after the cursor, and entries before it are claimed by the next full scan`() {
        val submitted = convenienceClient.submitDefaultFiles().submissionIdMappings
            .map { AccessionVersion(it.accession, it.version) }
            .sortedWith(compareBy({ it.accession }, { it.version }))
        // makes the first claim below a full scan, whatever an earlier test left behind
        Thread.sleep(FULL_SCAN_INTERVAL_SECONDS * 1000 + 100)

        assertThat(claim(3), `is`(submitted.subList(0, 3)))
        // a claim reset as stale: unprocessed again, but before the cursor
        transaction {
            exec(
                "delete from sequence_entries_preprocessed_data where accession = '${submitted[0].accession}'",
            )
        }
        assertThat(claim(100), `is`(submitted.subList(3, submitted.size)))
        assertThat(claim(100), `is`(emptyList()))

        Thread.sleep(FULL_SCAN_INTERVAL_SECONDS * 1000 + 100)
        assertThat(claim(100), `is`(listOf(submitted[0])))
    }

    @Test
    fun `entries remembered as revised are claimed before the next full scan`() {
        val submitted = convenienceClient.submitDefaultFiles().submissionIdMappings
            .map { AccessionVersion(it.accession, it.version) }
            .sortedWith(compareBy({ it.accession }, { it.version }))
        Thread.sleep(FULL_SCAN_INTERVAL_SECONDS * 1000 + 100)

        assertThat(claim(100), `is`(submitted))
        // unprocessed again and before the cursor, like the new version a revision adds
        transaction {
            exec(
                "delete from sequence_entries_preprocessed_data where accession = '${submitted[0].accession}'",
            )
        }
        assertThat(claim(100), `is`(emptyList()))

        submissionDatabaseService.rememberRevisedEntries(organism, listOf(submitted[0]))
        assertThat(claim(100), `is`(listOf(submitted[0])))
        assertThat(claim(100), `is`(emptyList()))
    }

    @Test
    fun `entries reset by the stale-claim clean-up are claimed by the next claim, before the next full scan`() {
        val submitted = convenienceClient.submitDefaultFiles().submissionIdMappings
            .map { AccessionVersion(it.accession, it.version) }
            .sortedWith(compareBy({ it.accession }, { it.version }))
        Thread.sleep(FULL_SCAN_INTERVAL_SECONDS * 1000 + 100)

        assertThat(claim(100), `is`(submitted))
        assertThat(claim(100), `is`(emptyList()))
        Thread.sleep(100)

        submissionDatabaseService.cleanUpStaleSequencesInProcessing(timeToStaleInSeconds = 0)
        assertThat(claim(100), `is`(submitted))
    }
}
