package org.loculus.backend.service.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.everyItem
import org.hamcrest.Matchers.hasSize
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
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

private const val PIPELINE_VERSION = 1L

@EndpointTest(properties = ["${BackendSpringProperty.STREAM_BATCH_SIZE}=2"])
class ClaimUnprocessedEntriesTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val submissionDatabaseService: SubmissionDatabaseService,
) {
    private val organism = Organism(DEFAULT_ORGANISM)

    private fun claim(numberOfSequenceEntries: Int, pipelineVersion: Long = PIPELINE_VERSION) =
        submissionDatabaseService.streamUnprocessedSubmissions(numberOfSequenceEntries, organism, pipelineVersion)
            .map { AccessionVersion(it.accession, it.version) }
            .toList()

    @Test
    fun `the claim relies on READ COMMITTED, where each statement sees claims committed before it started`() {
        val isolation = transaction {
            exec("show transaction_isolation") { rs ->
                rs.next()
                rs.getString(1)
            }
        }
        assertThat(isolation, `is`("read committed"))
    }

    @Test
    fun `WHEN many pollers claim concurrently THEN every entry is claimed exactly once`() {
        val submitted = (1..5).flatMap { convenienceClient.submitDefaultFiles().submissionIdMappings }
            .map { AccessionVersion(it.accession, it.version) }
        val claims = Collections.synchronizedList(mutableListOf<AccessionVersion>())
        val claimedCount = AtomicInteger()
        val pollers = 8
        val executor = Executors.newFixedThreadPool(pollers)
        val deadline = System.currentTimeMillis() + 60_000
        repeat(pollers) {
            executor.submit {
                while (claimedCount.get() < submitted.size && System.currentTimeMillis() < deadline) {
                    val claimed = transaction {
                        val keys = claim(3)
                        // keep the claim transaction open like a streaming response does
                        Thread.sleep(20)
                        keys
                    }
                    claims.addAll(claimed)
                    claimedCount.addAndGet(claimed.size)
                }
            }
        }
        executor.shutdown()
        executor.awaitTermination(90, TimeUnit.SECONDS)

        assertThat(claims.groupingBy { it }.eachCount().filterValues { it > 1 }.keys, `is`(empty()))
        assertThat(claims, containsInAnyOrder(*submitted.toTypedArray()))
    }

    @Test
    fun `GIVEN the first entries are held by an in-flight claim THEN a concurrent claim takes the next ones`() {
        val submitted = convenienceClient.submitDefaultFiles().submissionIdMappings
            .map { AccessionVersion(it.accession, it.version) }
            .sortedWith(compareBy({ it.accession }, { it.version }))
        val firstClaimed = CountDownLatch(1)
        val secondDone = CountDownLatch(1)
        val executor = Executors.newSingleThreadExecutor()
        val first = executor.submit<List<AccessionVersion>> {
            transaction {
                val keys = claim(3)
                firstClaimed.countDown()
                secondDone.await(30, TimeUnit.SECONDS)
                keys
            }
        }
        firstClaimed.await(30, TimeUnit.SECONDS)
        val second = transaction { claim(3) }
        secondDone.countDown()
        executor.shutdown()

        assertThat(first.get(30, TimeUnit.SECONDS), `is`(submitted.subList(0, 3)))
        assertThat(second, `is`(submitted.subList(3, 6)))
        assertThat(transaction { claim(100) }, `is`(submitted.subList(6, submitted.size)))
    }

    @Test
    fun `WHEN claiming THEN entries come in accession order across stream chunks`() {
        val submitted = convenienceClient.submitDefaultFiles().submissionIdMappings
            .map { AccessionVersion(it.accession, it.version) }
            .sortedWith(compareBy({ it.accession }, { it.version }))

        assertThat(transaction { claim(7) }, `is`(submitted.subList(0, 7)))
        assertThat(transaction { claim(7) }, `is`(submitted.subList(7, submitted.size)))
        assertThat(transaction { claim(7) }, `is`(empty()))
    }

    @Test
    fun `GIVEN revoked entries WHEN a new pipeline version claims THEN revocation versions are not claimed`() {
        val revocations = convenienceClient.prepareRevokedSequenceEntries()

        val claimed = transaction { claim(100, pipelineVersion = PIPELINE_VERSION + 1) }

        assertThat(claimed, hasSize(revocations.size))
        assertThat(claimed.map { it.version }, everyItem(`is`(1L)))
    }

    @Test
    fun `the candidate over-fetch is a multiple of small claims and capped for large ones`() {
        assertThat(claimCandidateLimit(100), `is`(1000))
        assertThat(claimCandidateLimit(100_000), `is`(110_000))
    }
}
