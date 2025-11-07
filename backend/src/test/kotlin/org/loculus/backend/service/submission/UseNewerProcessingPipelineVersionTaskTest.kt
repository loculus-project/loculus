package org.loculus.backend.service.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Organism
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.ORGANISM_WITHOUT_CONSENSUS_SEQUENCES
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.submission.PreparedProcessedData
import org.loculus.backend.controller.submission.SubmissionControllerClient
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.service.submission.dbtables.CurrentProcessingPipelineTable
import org.loculus.backend.utils.DateProvider
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class UseNewerProcessingPipelineVersionTaskTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val useNewerProcessingPipelineVersionTask: UseNewerProcessingPipelineVersionTask,
    @Autowired val submissionDatabaseService: SubmissionDatabaseService,
    @Autowired val dateProvider: DateProvider,
) {

    @Test
    fun `GIVEN error-free data from a newer pipeline WHEN the task is executed THEN the newer pipeline is used`() {
        assertThat(submissionDatabaseService.getCurrentProcessingPipelineVersion(Organism(DEFAULT_ORGANISM)), `is`(1L))
        val accessionVersions = convenienceClient.submitDefaultFiles().submissionIdMappings

        val processedData = accessionVersions.map {
            PreparedProcessedData.successfullyProcessed(it.accession, it.version)
        }
        val processedDataWithError = processedData.toMutableList()
        processedDataWithError[1] = PreparedProcessedData.withErrors(processedDataWithError[1].accession)

        convenienceClient.extractUnprocessedData(pipelineVersion = 1)
        convenienceClient.submitProcessedData(processedData, pipelineVersion = 1)
        useNewerProcessingPipelineVersionTask.task()
        assertThat(submissionDatabaseService.getCurrentProcessingPipelineVersion(Organism(DEFAULT_ORGANISM)), `is`(1L))

        convenienceClient.extractUnprocessedData(pipelineVersion = 2)
        convenienceClient.submitProcessedData(processedDataWithError, pipelineVersion = 2)
        useNewerProcessingPipelineVersionTask.task()
        assertThat(submissionDatabaseService.getCurrentProcessingPipelineVersion(Organism(DEFAULT_ORGANISM)), `is`(1L))

        convenienceClient.extractUnprocessedData(pipelineVersion = 3)
        convenienceClient.submitProcessedData(processedData, pipelineVersion = 3)
        useNewerProcessingPipelineVersionTask.task()
        assertThat(submissionDatabaseService.getCurrentProcessingPipelineVersion(Organism(DEFAULT_ORGANISM)), `is`(3L))

        submissionControllerClient.extractUnprocessedData(numberOfSequenceEntries = 10, pipelineVersion = 2)
            .andExpect(status().isUnprocessableEntity)
    }

    @Suppress("ktlint:standard:max-line-length")
    @Test
    fun `GIVEN the pipeline version for one organism updates THEN the pipeline version for another organism is not updated`() {
        assertThat(submissionDatabaseService.getCurrentProcessingPipelineVersion(Organism(DEFAULT_ORGANISM)), `is`(1L))
        assertThat(submissionDatabaseService.getCurrentProcessingPipelineVersion(Organism(OTHER_ORGANISM)), `is`(1L))

        val accessionVersions = convenienceClient.submitDefaultFiles().submissionIdMappings
        val processedData = accessionVersions.map {
            PreparedProcessedData.successfullyProcessed(it.accession, it.version)
        }
        convenienceClient.extractUnprocessedData(pipelineVersion = 2)
        convenienceClient.submitProcessedData(processedData, pipelineVersion = 2)
        useNewerProcessingPipelineVersionTask.task()

        assertThat(submissionDatabaseService.getCurrentProcessingPipelineVersion(Organism(DEFAULT_ORGANISM)), `is`(2L))
        assertThat(submissionDatabaseService.getCurrentProcessingPipelineVersion(Organism(OTHER_ORGANISM)), `is`(1L))
    }

    @Test
    fun `GIVEN the backend restarts THEN no faulty V1 entries are created`() {
        val rowCount = transaction {
            CurrentProcessingPipelineTable.setV1ForOrganismsIfNotExist(
                listOf(DEFAULT_ORGANISM, OTHER_ORGANISM, ORGANISM_WITHOUT_CONSENSUS_SEQUENCES),
                dateProvider.getCurrentDateTime(),
            )

            CurrentProcessingPipelineTable.selectAll().count()
        }

        // update DEFAULT_ORGANISM to V2
        val accessionVersions = convenienceClient.submitDefaultFiles().submissionIdMappings
        val processedData = accessionVersions.map {
            PreparedProcessedData.successfullyProcessed(it.accession, it.version)
        }
        convenienceClient.extractUnprocessedData(pipelineVersion = 2)
        convenienceClient.submitProcessedData(processedData, pipelineVersion = 2)
        useNewerProcessingPipelineVersionTask.task()

        val rowCountAfterV2 = transaction {
            // simulate a DB init by calling this function
            CurrentProcessingPipelineTable.setV1ForOrganismsIfNotExist(
                listOf(DEFAULT_ORGANISM, OTHER_ORGANISM, ORGANISM_WITHOUT_CONSENSUS_SEQUENCES),
                dateProvider.getCurrentDateTime(),
            )

            CurrentProcessingPipelineTable.selectAll().count()
        }

        assertThat(rowCount, `is`(rowCountAfterV2))
    }

    @Suppress("ktlint:standard:max-line-length")
    @Test
    fun `GIVEN no new processed data WHEN checking for newer pipeline multiple times THEN subsequent calls return empty map`() {
        val accessionVersions = convenienceClient.submitDefaultFiles().submissionIdMappings
        val processedData = accessionVersions.map {
            PreparedProcessedData.successfullyProcessed(it.accession, it.version)
        }
        convenienceClient.extractUnprocessedData(pipelineVersion = 1)
        convenienceClient.submitProcessedData(processedData, pipelineVersion = 1)

        val firstCall = submissionDatabaseService.useNewerProcessingPipelineIfPossible()
        val secondCall = submissionDatabaseService.useNewerProcessingPipelineIfPossible()

        assertThat(firstCall.keys, `is`(setOf(DEFAULT_ORGANISM)))
        assertThat(secondCall.isEmpty(), `is`(true))
    }

    @Test
    fun `GIVEN multiple pipeline versions exist WHEN the version is bumped THEN old data is deleted`() {
        // ... but only for that organism!

        // create data for OTHER_ORGANISM - so we can check later that it doesn't get deleted
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(
            organism = OTHER_ORGANISM,
        )

        val processedData = convenienceClient.submitDefaultFiles().submissionIdMappings.map {
            PreparedProcessedData.successfullyProcessed(it.accession, it.version)
        }

        convenienceClient.extractUnprocessedData(pipelineVersion = 1)
        convenienceClient.submitProcessedData(processedData, pipelineVersion = 1)
        useNewerProcessingPipelineVersionTask.task()

        convenienceClient.extractUnprocessedData(pipelineVersion = 2)
        convenienceClient.submitProcessedData(processedData, pipelineVersion = 2)
        useNewerProcessingPipelineVersionTask.task()

        transaction {
            // check that nothing got deleted yet
            assertThat(getExistingPipelineVersions(DEFAULT_ORGANISM), `is`(listOf(1L, 2L)))
            assertThat(getExistingPipelineVersions(OTHER_ORGANISM), `is`(listOf(1L)))
        }

        convenienceClient.extractUnprocessedData(pipelineVersion = 3)
        convenienceClient.submitProcessedData(processedData, pipelineVersion = 3)
        useNewerProcessingPipelineVersionTask.task()

        assertThat(submissionDatabaseService.getCurrentProcessingPipelineVersion(Organism(DEFAULT_ORGANISM)), `is`(3L))

        transaction {
            // check that v1 for DEFAULT_ORGANISM is deleted, but not for OTHER_ORGANISM
            assertThat(getExistingPipelineVersions(DEFAULT_ORGANISM), `is`(listOf(2L, 3L)))
            assertThat(getExistingPipelineVersions(OTHER_ORGANISM), `is`(listOf(1L)))
        }
    }

    /**
     * Returns an ordered list of pipeline versions for which data exists in the
     * SequenceEntriesPreprocessedDataTable table.
     */
    private fun getExistingPipelineVersions(organism: String) = SequenceEntriesPreprocessedDataTable
        .join(SequenceEntriesTable, joinType = JoinType.INNER) {
            (SequenceEntriesPreprocessedDataTable.accessionColumn eq SequenceEntriesTable.accessionColumn) and
                (SequenceEntriesPreprocessedDataTable.versionColumn eq SequenceEntriesTable.versionColumn)
        }
        .select(SequenceEntriesPreprocessedDataTable.pipelineVersionColumn)
        .where { SequenceEntriesTable.organismColumn eq organism }
        .orderBy(SequenceEntriesPreprocessedDataTable.pipelineVersionColumn)
        .groupBy(SequenceEntriesPreprocessedDataTable.pipelineVersionColumn)
        .map { it[SequenceEntriesPreprocessedDataTable.pipelineVersionColumn] }
}
