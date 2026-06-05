package org.loculus.backend.service.files

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.`is`
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.api.OriginalData
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.service.submission.CompressedSequence
import org.loculus.backend.service.submission.SequenceEntriesPreprocessedDataTable
import org.loculus.backend.service.submission.SequenceEntriesTable
import org.loculus.backend.service.submission.dbtables.CurrentProcessingPipelineTable
import org.loculus.backend.utils.DateProvider
import org.springframework.beans.factory.annotation.Autowired
import java.util.UUID

/**
 * Tests for the raw SQL in [FilesDatabaseService.getOrphanedFileIds].
 *
 * This is where all the correctness risk of the garbage collection lives, so the cases are
 * exercised directly against the database without involving S3. The `threshold` is passed
 * explicitly, which lets us isolate the *reference* logic (these tests use a far-back threshold
 * so every file is age-eligible) from the *age gate* (tested separately).
 *
 * The pipeline-version-upgrade task is effectively disabled via a huge check interval so it can't
 * concurrently bump the current pipeline version or delete preprocessed rows mid-test.
 */
@EndpointTest(
    properties = [
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
    fun `GIVEN a file only referenced in original_data THEN it is orphaned, but unprocessed_data is protected`() {
        // A user edited a submission, replacing `editedAway` with `currentFile`.
        // After the edit, only `unprocessed_data` is updated, so `editedAway` lingers in
        // `original_data` (which the query intentionally ignores) and should be reclaimed.
        val editedAway = UUID.randomUUID()
        val currentFile = UUID.randomUUID()
        listOf(editedAway, currentFile).forEach { insertFile(it, requestedAt = daysAgo(10)) }
        insertSequenceEntry(
            accession = "A1",
            version = 1,
            original = filesReferencing(editedAway),
            unprocessed = filesReferencing(currentFile),
        )

        val orphans = filesDatabaseService.getOrphanedFileIds(daysAgo(5))

        assertThat(orphans, containsInAnyOrder(editedAway))
    }

    @Test
    fun `GIVEN processed_data files THEN only those from a pipeline version older than current are orphaned`() {
        setCurrentPipelineVersion(DEFAULT_ORGANISM, 2)
        val fileFromOldVersion = UUID.randomUUID() // pipeline v1 (< current) -> orphaned
        val fileFromCurrentVersion = UUID.randomUUID() // pipeline v2 (== current) -> protected
        val fileFromNewerVersion = UUID.randomUUID() // pipeline v3 (> current, rollout) -> protected
        listOf(fileFromOldVersion, fileFromCurrentVersion, fileFromNewerVersion)
            .forEach { insertFile(it, requestedAt = daysAgo(10)) }

        // The sequence entry itself references no files, so only the processed_data references matter.
        insertSequenceEntry(accession = "A1", version = 1, original = null, unprocessed = filesReferencing(null))
        insertPreprocessed(
            accession = "A1",
            version = 1,
            pipelineVersion = 1,
            processed = processedReferencing(fileFromOldVersion),
        )
        insertPreprocessed(
            accession = "A1",
            version = 1,
            pipelineVersion = 2,
            processed = processedReferencing(fileFromCurrentVersion),
        )
        insertPreprocessed(
            accession = "A1",
            version = 1,
            pipelineVersion = 3,
            processed = processedReferencing(fileFromNewerVersion),
        )

        val orphans = filesDatabaseService.getOrphanedFileIds(daysAgo(5))

        assertThat(orphans, containsInAnyOrder(fileFromOldVersion))
    }

    @Test
    fun `GIVEN unreferenced files THEN only those whose upload was requested before the threshold are orphaned`() {
        val old = UUID.randomUUID()
        val recent = UUID.randomUUID()
        insertFile(old, requestedAt = daysAgo(10))
        insertFile(recent, requestedAt = daysAgo(1))

        val orphans = filesDatabaseService.getOrphanedFileIds(daysAgo(5))

        assertThat(orphans, containsInAnyOrder(old))
    }

    @Test
    fun `GIVEN a file referenced by an old, superseded version THEN it is still protected`() {
        // Branch 1 of the query has no version filter: a file referenced by ANY version's
        // unprocessed_data must survive, even if that version is no longer the latest.
        val fileInOldVersion = UUID.randomUUID()
        insertFile(fileInOldVersion, requestedAt = daysAgo(10))
        insertSequenceEntry(
            accession = "A1",
            version = 1,
            original = null,
            unprocessed = filesReferencing(fileInOldVersion),
        )
        insertSequenceEntry(accession = "A1", version = 2, original = null, unprocessed = filesReferencing(null))

        val orphans = filesDatabaseService.getOrphanedFileIds(daysAgo(5))

        assertThat(orphans.isEmpty(), `is`(true))
    }

    private fun daysAgo(days: Long): LocalDateTime = dateProvider.getCurrentInstant()
        .minus(days, DateTimeUnit.DAY, DateProvider.timeZone)
        .toLocalDateTime(DateProvider.timeZone)

    private fun insertFile(id: UUID, requestedAt: LocalDateTime) = transaction {
        FilesTable.insert {
            it[idColumn] = id
            it[uploadRequestedAtColumn] = requestedAt
            it[uploaderColumn] = "testuser"
            it[groupIdColumn] = groupId
            it[multipartCompleted] = true
        }
    }

    private fun insertSequenceEntry(
        accession: String,
        version: Long,
        original: OriginalData<CompressedSequence>?,
        unprocessed: OriginalData<CompressedSequence>?,
    ) = transaction {
        SequenceEntriesTable.insert {
            it[accessionColumn] = accession
            it[versionColumn] = version
            it[organismColumn] = DEFAULT_ORGANISM
            it[submissionIdColumn] = "submission-$accession-$version"
            it[submitterColumn] = "testuser"
            it[groupIdColumn] = groupId
            it[submittedAtTimestampColumn] = dateProvider.getCurrentDateTime()
            it[originalDataColumn] = original
            it[unprocessedDataColumn] = unprocessed
        }
    }

    private fun insertPreprocessed(
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

    private fun setCurrentPipelineVersion(organism: String, version: Long) = transaction {
        CurrentProcessingPipelineTable.update({ CurrentProcessingPipelineTable.organismColumn eq organism }) {
            it[versionColumn] = version
        }
    }

    private fun filesReferencing(fileId: UUID?): OriginalData<CompressedSequence> = OriginalData(
        metadata = emptyMap(),
        unalignedNucleotideSequences = emptyMap(),
        files = fileId?.let { mapOf("rawReads" to listOf(FileIdAndName(it, "raw.txt"))) },
    )

    private fun processedReferencing(fileId: UUID): ProcessedData<CompressedSequence> = ProcessedData(
        metadata = emptyMap(),
        unalignedNucleotideSequences = emptyMap(),
        alignedNucleotideSequences = emptyMap(),
        nucleotideInsertions = emptyMap(),
        alignedAminoAcidSequences = emptyMap(),
        aminoAcidInsertions = emptyMap(),
        files = mapOf("processedOutput" to listOf(FileIdAndName(fileId, "out.txt"))),
    )
}
