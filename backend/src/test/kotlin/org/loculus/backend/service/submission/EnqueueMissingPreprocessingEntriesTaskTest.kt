package org.loculus.backend.service.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.`is`
import org.hamcrest.Matchers.not
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.select
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.PreprocessingStatus.UNPROCESSED
import org.loculus.backend.api.Status.IN_PROCESSING
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.getAccessionVersions
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest(
    properties = [
        "${BackendSpringProperty.ENQUEUE_MISSING_PREPROCESSING_ENTRIES_EVERY_SECONDS}=3600",
    ],
)
class EnqueueMissingPreprocessingEntriesTaskTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val enqueueMissingPreprocessingEntriesTask: EnqueueMissingPreprocessingEntriesTask,
) {

    @Test
    fun `GIVEN entries without a queue row WHEN running the task THEN they are queued again`() {
        convenienceClient.submitDefaultFiles()
        // The first claim registers the pipeline version and queues every entry.
        val claim = convenienceClient.extractUnprocessedData(numberOfSequenceEntries = 1).single()
        val missing = removeUnprocessedQueueRows()
        assertThat(missing, `is`(not(empty())))
        assertThat(convenienceClient.extractUnprocessedData(), `is`(empty()))

        enqueueMissingPreprocessingEntriesTask.task()

        assertThat(
            convenienceClient.extractUnprocessedData().getAccessionVersions(),
            containsInAnyOrder(*missing.toTypedArray()),
        )
        convenienceClient.getSequenceEntry(claim.accession, claim.version)
            .assertStatusIs(IN_PROCESSING)
    }

    @Test
    fun `GIVEN no pipeline version is registered WHEN running the task THEN nothing is queued`() {
        convenienceClient.submitDefaultFiles()

        enqueueMissingPreprocessingEntriesTask.task()

        assertThat(queueRows(), `is`(empty()))
    }

    // As if the entries had been submitted through a backend from before the queue.
    private fun removeUnprocessedQueueRows(): List<AccessionVersion> = transaction {
        val missing = queueRows()
        SequenceEntriesPreprocessedDataTable.deleteWhere { statusIs(UNPROCESSED) }
        missing
    }

    private fun queueRows() = transaction {
        val queue = SequenceEntriesPreprocessedDataTable
        queue
            .select(queue.accessionColumn, queue.versionColumn)
            .where { queue.statusIs(UNPROCESSED) and (queue.pipelineVersionColumn eq 1L) }
            .map { AccessionVersion(it[queue.accessionColumn], it[queue.versionColumn]) }
    }
}
