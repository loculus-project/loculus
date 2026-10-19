package org.loculus.backend.api.v0.submission

import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.hamcrest.Matchers.empty
import org.junit.jupiter.api.Test
import org.loculus.backend.testutil.DEFAULT_PIPELINE_VERSION
import org.loculus.backend.testutil.EndpointTest
import org.loculus.backend.testutil.expectNdjsonAndGetContent
import org.loculus.backend.types.AccessionVersion
import org.loculus.backend.types.UnprocessedData
import org.springframework.beans.factory.annotation.Autowired

private const val CLAIM_TIMEOUT_SECONDS = 30L

@EndpointTest
class ConcurrentPreprocessingClaimEndpointTest(
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val client: SubmissionControllerClient,
) {
    @Test
    fun `GIVEN concurrent claims THEN each entry is returned once`() {
        val expectedEntries = convenienceClient.submitDefaultFiles().submissionIdMappings
            .map { AccessionVersion(it.accession, it.version) }
            .toSet()
        // Populates the queue first, so both claims compete for the same rows.
        convenienceClient.extractUnprocessedData(numberOfSequenceEntries = 0)

        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)

        try {
            val claims = List(2) {
                executor.submitClaim(start, expectedEntries.size)
            }
            start.countDown()

            val first = claims[0]
                .get(CLAIM_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .toAccessionVersions()
            val second = claims[1]
                .get(CLAIM_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .toAccessionVersions()

            assertThat(first.intersect(second), `is`(empty()))
            assertThat(first + second, `is`(expectedEntries))
            assertThat(claim(expectedEntries.size), `is`(empty()))
        } finally {
            executor.shutdownNow()
            executor.awaitTermination(CLAIM_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        }
    }

    @Test
    fun `GIVEN concurrent first claims of a new pipeline version THEN each entry is returned once`() {
        val expectedEntries = convenienceClient.submitDefaultFiles().submissionIdMappings
            .map { AccessionVersion(it.accession, it.version) }
            .toSet()
        val newPipelineVersion = DEFAULT_PIPELINE_VERSION + 1

        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)

        try {
            // Both requests register the version, only one of them backfills the queue.
            val claims = List(2) {
                executor.submitClaim(start, expectedEntries.size, newPipelineVersion)
            }
            start.countDown()

            val first = claims[0]
                .get(CLAIM_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .toAccessionVersions()
            val second = claims[1]
                .get(CLAIM_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .toAccessionVersions()
            val rest = claim(expectedEntries.size, newPipelineVersion).toAccessionVersions()

            assertThat(first.intersect(second), `is`(empty()))
            assertThat((first + second).intersect(rest), `is`(empty()))
            assertThat(first + second + rest, `is`(expectedEntries))
            assertThat(claim(expectedEntries.size, newPipelineVersion), `is`(empty()))
        } finally {
            executor.shutdownNow()
            executor.awaitTermination(CLAIM_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        }
    }

    private fun ExecutorService.submitClaim(
        start: CountDownLatch,
        numberOfEntries: Int,
        pipelineVersion: Long = DEFAULT_PIPELINE_VERSION,
    ) = submit(
        Callable {
            check(start.await(CLAIM_TIMEOUT_SECONDS, TimeUnit.SECONDS))
            claim(numberOfEntries, pipelineVersion)
        },
    )

    private fun claim(numberOfEntries: Int, pipelineVersion: Long = DEFAULT_PIPELINE_VERSION): List<UnprocessedData> =
        client.extractUnprocessedData(numberOfEntries, pipelineVersion = pipelineVersion)
            .expectNdjsonAndGetContent()

    private fun List<UnprocessedData>.toAccessionVersions(): Set<AccessionVersion> =
        map { AccessionVersion(it.accession, it.version) }.toSet()
}
