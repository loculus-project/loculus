package org.loculus.backend.service.submission

import io.mockk.every
import io.mockk.mockk
import kotlinx.datetime.LocalDate
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.select
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsType
import org.loculus.backend.api.Organism
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.dateMonthsFromNow
import org.loculus.backend.model.SubmissionParams
import org.loculus.backend.service.datauseterms.DATA_USE_TERMS_TABLE_NAME
import org.loculus.backend.service.datauseterms.DataUseTermsDatabaseService
import org.loculus.backend.service.datauseterms.DataUseTermsTable
import org.loculus.backend.service.groupmanagement.GroupManagementDatabaseService
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.MetadataEntry
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.mock.web.MockMultipartFile

@EndpointTest
class UploadDatabaseServiceTest(
    @Autowired private val uploadDatabaseService: UploadDatabaseService,
    @Autowired private val dataUseTermsDatabaseService: DataUseTermsDatabaseService,
    @Autowired private val groupManagementDatabaseService: GroupManagementDatabaseService,
    @Autowired private val dateProvider: DateProvider,
) {
    @Test
    fun `WHEN mapping an original upload THEN inserts its initial data use terms in one set`() {
        val authenticatedUser = testUser()
        val groupId = groupManagementDatabaseService.createNewGroup(DEFAULT_GROUP, authenticatedUser).groupId
        val targetUploadId = "target-terms-upload"
        val otherUploadId = "other-terms-upload"
        val restrictedUntil = dateMonthsFromNow(6)

        insertMetadata(targetUploadId, listOf("target-1", "target-2"), authenticatedUser, groupId)
        insertMetadata(otherUploadId, listOf("other-1"), authenticatedUser, groupId)
        uploadDatabaseService.generateNewAccessionsForOriginalUpload(targetUploadId)
        uploadDatabaseService.generateNewAccessionsForOriginalUpload(otherUploadId)

        val mappings = uploadDatabaseService.mapAndCopy(
            targetUploadId,
            originalSubmissionParams(authenticatedUser, groupId, DataUseTerms.Restricted(restrictedUntil)),
        )

        val rows = getDataUseTermsRows()
        assertEquals(mappings.size, rows.size)
        assertEquals(mappings.map { it.accession }.toSet(), rows.map { it.accession }.toSet())
        assertTrue(rows.all { it.type == DataUseTermsType.RESTRICTED.toString() })
        assertTrue(rows.all { it.restrictedUntil == restrictedUntil })
        assertTrue(rows.all { it.username == TEST_USERNAME })
        assertEquals(1, rows.map { it.changeDate }.toSet().size)

        val trackerRows = getDataUseTermsTrackerRows()
        assertEquals(1, trackerRows.size)
        assertEquals(DEFAULT_ORGANISM, trackerRows.single().organism)
        assertNull(trackerRows.single().pipelineVersion)
    }

    @Test
    fun `WHEN initial data use terms count does not match THEN rolls back terms and tracker`() {
        val authenticatedUser = testUser()
        val groupId = groupManagementDatabaseService.createNewGroup(DEFAULT_GROUP, authenticatedUser).groupId
        val uploadId = "mismatched-terms-upload"

        insertMetadata(uploadId, listOf("target-1", "target-2"), authenticatedUser, groupId)
        uploadDatabaseService.generateNewAccessionsForOriginalUpload(uploadId)
        uploadDatabaseService.mapAndCopy(uploadId, revisionSubmissionParams(authenticatedUser))

        val exception = assertThrows<IllegalStateException> {
            dataUseTermsDatabaseService.setInitialDataUseTerms(
                authenticatedUser = authenticatedUser,
                uploadId = uploadId,
                expectedCount = 3,
                newDataUseTerms = DataUseTerms.Open,
            )
        }

        assertTrue(exception.message!!.contains("but inserted 2"))
        assertTrue(getDataUseTermsRows().isEmpty())
        assertTrue(getDataUseTermsTrackerRows().isEmpty())
    }

    private fun insertMetadata(
        uploadId: String,
        submissionIds: List<String>,
        authenticatedUser: AuthenticatedUser,
        groupId: Int = 1,
    ) {
        uploadDatabaseService.batchInsertMetadataInAuxTable(
            uploadId = uploadId,
            authenticatedUser = authenticatedUser,
            groupId = groupId,
            submittedOrganism = Organism(DEFAULT_ORGANISM),
            uploadedMetadataBatch = submissionIds.map {
                MetadataEntry(it, mapOf("field" to "value"))
            },
            uploadedAt = dateProvider.getCurrentDateTime(),
        )
    }

    private fun getDataUseTermsRows(): List<DataUseTermsRow> = transaction {
        DataUseTermsTable.selectAll().map {
            DataUseTermsRow(
                accession = it[DataUseTermsTable.accessionColumn],
                changeDate = it[DataUseTermsTable.changeDateColumn].toString(),
                type = it[DataUseTermsTable.dataUseTermsTypeColumn],
                restrictedUntil = it[DataUseTermsTable.restrictedUntilColumn],
                username = it[DataUseTermsTable.userNameColumn],
            )
        }
    }

    private fun getDataUseTermsTrackerRows(): List<TrackerRow> = transaction {
        UpdateTrackerTable
            .selectAll()
            .where { UpdateTrackerTable.tableNameColumn eq DATA_USE_TERMS_TABLE_NAME }
            .map {
                TrackerRow(
                    organism = it[UpdateTrackerTable.organismColumn],
                    pipelineVersion = it[UpdateTrackerTable.pipelineVersionColumn],
                )
            }
    }

    private fun testUser(): AuthenticatedUser = mockk<AuthenticatedUser>().also {
        every { it.username } returns TEST_USERNAME
        every { it.isSuperUser } returns false
    }

    private fun originalSubmissionParams(
        authenticatedUser: AuthenticatedUser,
        groupId: Int,
        dataUseTerms: DataUseTerms,
    ) = SubmissionParams.OriginalSubmissionParams(
        organism = Organism(DEFAULT_ORGANISM),
        authenticatedUser = authenticatedUser,
        metadataFile = emptyMetadataFile(),
        sequenceFile = null,
        groupId = groupId,
        dataUseTerms = dataUseTerms,
    )

    private fun revisionSubmissionParams(authenticatedUser: AuthenticatedUser) =
        SubmissionParams.RevisionSubmissionParams(
            organism = Organism(DEFAULT_ORGANISM),
            authenticatedUser = authenticatedUser,
            metadataFile = emptyMetadataFile(),
            sequenceFile = null,
        )

    private fun emptyMetadataFile() = MockMultipartFile(
        "metadataFile",
        "metadata.tsv",
        "text/tab-separated-values",
        byteArrayOf(),
    )

    private data class DataUseTermsRow(
        val accession: String,
        val changeDate: String,
        val type: String,
        val restrictedUntil: LocalDate?,
        val username: String,
    )

    private data class TrackerRow(val organism: String?, val pipelineVersion: Long?)

    private companion object {
        const val TEST_USERNAME = "initial-terms-test-user"
    }
}
