package org.loculus.backend.service.files

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.SubmittedData
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.service.daysAgo
import org.loculus.backend.service.insertFile
import org.loculus.backend.service.submission.CompressedSequence
import org.loculus.backend.service.submission.SequenceEntriesPreprocessedDataTable
import org.loculus.backend.service.submission.SequenceEntriesTable
import org.loculus.backend.service.submission.dbtables.CurrentProcessingPipelineTable
import org.loculus.backend.utils.DateProvider
import org.springframework.beans.factory.annotation.Autowired
import java.util.UUID

/**
 * Testing of orphan file detection logic in [FilesDatabaseService.getOrphanedFileIds].
 */
@EndpointTest(
    properties = [
        // set to high value to prevent tests from triggering pipeline version upgrade task
        "${BackendSpringProperty.PIPELINE_VERSION_UPGRADE_CHECK_INTERVAL_SECONDS}=999999",
    ],
)
class GetOrphanedFileIdsTest(
    @Autowired val filesDatabaseService: FilesDatabaseService,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
    @Autowired val dateProvider: DateProvider,
) {
    private var groupId = 0

    @BeforeEach
    fun createGroup() {
        groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
    }

    @Test
    fun `GIVEN unreferenced files THEN only those whose upload was requested before the threshold are orphaned`() {
        val old = UUID.randomUUID()
        val recent = UUID.randomUUID()
        insertFile(old, groupId, daysAgo(10))
        insertFile(recent, groupId, daysAgo(1))

        val orphans = filesDatabaseService.getOrphanedFileIds(daysAgo(5))

        assertThat(orphans, `is`(setOf(old)))
    }

    @Test
    fun `GIVEN multiple pipeline versions THEN files from all pipeline versions are protected`() {
        transaction {
            CurrentProcessingPipelineTable.update(
                { CurrentProcessingPipelineTable.organismColumn eq DEFAULT_ORGANISM },
            ) {
                it[versionColumn] = 2
            }
        }

        val fileFromOldPipeline = UUID.randomUUID() // pipeline version 1 (< current)
        val fileFromCurrentPipeline = UUID.randomUUID() // pipeline version 2 (current)
        val fileFromNewerPipeline = UUID.randomUUID() // pipeline version 3 (> current)
        listOf(fileFromOldPipeline, fileFromCurrentPipeline, fileFromNewerPipeline)
            .forEach { insertFile(it, groupId, daysAgo(10)) }

        // The sequence entry itself references no files, so only the processed_data references matter.
        insertSequenceEntry(accession = "A", version = 1, archive = null, submitted = makeUnprocessedData(null))
        insertPreprocessedData(
            accession = "A",
            version = 1,
            pipelineVersion = 1,
            processed = makeProcessedData(fileFromOldPipeline),
        )
        insertPreprocessedData(
            accession = "A",
            version = 1,
            pipelineVersion = 2,
            processed = makeProcessedData(fileFromCurrentPipeline),
        )
        insertPreprocessedData(
            accession = "A",
            version = 1,
            pipelineVersion = 3,
            processed = makeProcessedData(fileFromNewerPipeline),
        )

        val orphans = filesDatabaseService.getOrphanedFileIds(daysAgo(5))

        assertThat(orphans, `is`(emptySet()))
    }

    @Test
    fun `GIVEN a file referenced only by old version THEN it is still protected`() {
        val fileInOldVersion = UUID.randomUUID()
        insertFile(fileInOldVersion, groupId, daysAgo(10))
        insertSequenceEntry(
            accession = "A",
            version = 1,
            archive = null,
            submitted = makeUnprocessedData(fileInOldVersion),
        )
        insertSequenceEntry(accession = "A", version = 2, archive = null, submitted = makeUnprocessedData(null))

        val orphans = filesDatabaseService.getOrphanedFileIds(daysAgo(5))

        assertThat(orphans.isEmpty(), `is`(true))
    }

    private fun insertSequenceEntry(
        accession: String,
        version: Long,
        archive: SubmittedData<CompressedSequence>?,
        submitted: SubmittedData<CompressedSequence>?,
    ) = transaction {
        SequenceEntriesTable.insert {
            it[accessionColumn] = accession
            it[versionColumn] = version
            it[organismColumn] = DEFAULT_ORGANISM
            it[submissionIdColumn] = "submission-$accession-$version"
            it[submitterColumn] = "testuser"
            it[groupIdColumn] = groupId
            it[submittedAtTimestampColumn] = dateProvider.getCurrentDateTime()
            it[archiveOfSubmittedDataColumn] = archive
            it[submittedDataColumn] = submitted
        }
    }

    private fun insertPreprocessedData(
        accession: String,
        version: Long,
        pipelineVersion: Long,
        processed: ProcessedData<CompressedSequence>,
    ) = transaction {
        SequenceEntriesPreprocessedDataTable.insert {
            it[accessionColumn] = accession
            it[versionColumn] = version
            it[pipelineVersionColumn] = pipelineVersion
            it[processedDataColumn] = processed
            it[processingStatusColumn] = "PROCESSED"
            it[startedProcessingAtColumn] = dateProvider.getCurrentDateTime()
        }
    }

    private fun makeUnprocessedData(fileId: UUID?): SubmittedData<CompressedSequence> = SubmittedData(
        metadata = emptyMap(),
        unalignedNucleotideSequences = emptyMap(),
        files = fileId?.let { mapOf("rawReads" to listOf(FileIdAndName(it, "raw.fastq"))) },
    )

    private fun makeProcessedData(fileId: UUID): ProcessedData<CompressedSequence> = ProcessedData(
        metadata = emptyMap(),
        unalignedNucleotideSequences = emptyMap(),
        alignedNucleotideSequences = emptyMap(),
        nucleotideInsertions = emptyMap(),
        alignedAminoAcidSequences = emptyMap(),
        aminoAcidInsertions = emptyMap(),
        files = mapOf("processedOutput" to listOf(FileIdAndName(fileId, "aligned.bam"))),
    )
}
