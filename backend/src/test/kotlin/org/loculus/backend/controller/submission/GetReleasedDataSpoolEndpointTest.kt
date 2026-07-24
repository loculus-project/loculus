package org.loculus.backend.controller.submission

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.api.ReleasedData
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.ServiceUnavailableException
import org.loculus.backend.controller.expectNdjsonAndGetContent
import org.loculus.backend.service.KeycloakAdapter
import org.loculus.backend.service.submission.SPOOL_FILE_PREFIX
import org.loculus.backend.service.submission.SPOOL_RETRY_AFTER_SECONDS
import org.loculus.backend.service.submission.SpooledStream
import org.loculus.backend.service.submission.StreamSpoolService
import org.loculus.backend.utils.IteratorStreamer
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpHeaders
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.io.File
import java.sql.SQLException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

private const val TEST_SPOOL_DIR = "build/test-released-data-spool"

@EndpointTest(
    properties = [
        "loculus.stream.spool-dir=$TEST_SPOOL_DIR",
        "loculus.stream.max-concurrent-spools=1",
    ],
)
class GetReleasedDataSpoolEndpointTest(
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val submissionControllerClient: SubmissionControllerClient,
    @Autowired private val streamSpoolService: StreamSpoolService,
    @Autowired private val iteratorStreamer: IteratorStreamer,
) {
    private val spoolDir = File(TEST_SPOOL_DIR)

    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    @BeforeEach
    fun setup() {
        every { keycloakAdapter.getUsersWithName(any()) } returns listOf(UserRepresentation())
        spoolFiles().forEach { it.delete() }
    }

    private fun spoolFiles(): List<File> =
        spoolDir.listFiles { file -> file.name.startsWith(SPOOL_FILE_PREFIX) }?.toList().orEmpty()

    @Test
    fun `GIVEN released data THEN the spool temp file is deleted after the response is served`() {
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()

        val responseBody = submissionControllerClient.getReleasedData()
            .andExpect(status().isOk)
            .expectNdjsonAndGetContent<ReleasedData>()
        assertThat(responseBody.isNotEmpty(), `is`(true))

        assertThat(spoolFiles(), `is`(emptyList()))
    }

    @Test
    fun `GIVEN a database retry THEN the spool contains only the successful attempt`() {
        var attempts = 0

        val spooled = streamSpoolService.spool(null, endpoint = "retry-test") {
            val attempt = ++attempts
            sequence {
                yield("attempt $attempt")
                if (attempt == 1) {
                    throw SQLException("retry this transaction")
                }
            }
        }

        try {
            assertThat(attempts, `is`(2))
            assertThat(spooled.recordCount, `is`(1L))
            assertThat(spooled.file.readLines(), `is`(listOf("\"attempt 2\"")))
        } finally {
            spooled.close()
        }
    }

    @Test
    fun `GIVEN generation in progress THEN another request gets retry guidance`() {
        val generationStarted = CountDownLatch(1)
        val finishGeneration = CountDownLatch(1)
        val executor = Executors.newSingleThreadExecutor()
        val generation = executor.submit<SpooledStream> {
            streamSpoolService.spool(null, endpoint = "active-test") {
                sequence {
                    generationStarted.countDown()
                    check(finishGeneration.await(10, TimeUnit.SECONDS))
                    yield("complete")
                }
            }
        }
        try {
            assertThat(generationStarted.await(10, TimeUnit.SECONDS), `is`(true))

            submissionControllerClient.getReleasedData()
                .andExpect(status().isServiceUnavailable)
                .andExpect {
                    assertThat(
                        it.response.getHeader(HttpHeaders.RETRY_AFTER),
                        `is`(SPOOL_RETRY_AFTER_SECONDS.toString()),
                    )
                }

            finishGeneration.countDown()
            val completed = generation.get(10, TimeUnit.SECONDS)

            completed.file.setLastModified(
                System.currentTimeMillis() - TimeUnit.DAYS.toMillis(1),
            )
            streamSpoolService.sweepOrphanedSpoolFiles()
            assertThat(completed.file.exists(), `is`(true))

            streamSpoolService.spool(null, endpoint = "next-test") { emptySequence<String>() }.close()
        } finally {
            finishGeneration.countDown()
            runCatching { generation.get(10, TimeUnit.SECONDS).close() }
            executor.shutdownNow()
        }
    }

    @Test
    fun `GIVEN a full spool quota THEN writing stops with a controlled error`() {
        val limitedDir = File(spoolDir, "limited")
        val limitedService = StreamSpoolService(
            iteratorStreamer = iteratorStreamer,
            spoolDir = limitedDir.absolutePath,
            maxConcurrentSpools = 1,
            maxTotalBytes = 1,
            minFreeBytes = 0,
            spoolFileTtlMinutes = 60,
        )

        try {
            assertThrows<ServiceUnavailableException> {
                limitedService.spool(null, endpoint = "quota-test") { sequenceOf("too large") }
            }
            assertThat(
                limitedDir.listFiles { file -> file.name.startsWith(SPOOL_FILE_PREFIX) }?.toList().orEmpty(),
                `is`(emptyList()),
            )
        } finally {
            limitedService.releaseDirectoryLock()
        }
    }
}
