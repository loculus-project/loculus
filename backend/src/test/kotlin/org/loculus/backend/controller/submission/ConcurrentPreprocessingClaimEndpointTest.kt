package org.loculus.backend.controller.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectNdjsonAndGetContent
import org.springframework.beans.factory.annotation.Autowired
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

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

    private fun ExecutorService.submitClaim(start: CountDownLatch, numberOfEntries: Int) = submit(
        Callable {
            check(start.await(CLAIM_TIMEOUT_SECONDS, TimeUnit.SECONDS))
            claim(numberOfEntries)
        },
    )

    private fun claim(numberOfEntries: Int): List<UnprocessedData> = client.extractUnprocessedData(numberOfEntries)
        .expectNdjsonAndGetContent()

    private fun List<UnprocessedData>.toAccessionVersions(): Set<AccessionVersion> =
        map { AccessionVersion(it.accession, it.version) }.toSet()
}
