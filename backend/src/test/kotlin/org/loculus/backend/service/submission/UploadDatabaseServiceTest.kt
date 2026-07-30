package org.loculus.backend.service.submission

import io.mockk.every
import io.mockk.mockk
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Organism
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.service.GenerateAccessionFromNumberService
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.MetadataEntry
import org.springframework.beans.factory.annotation.Autowired

private const val NUMBER_OF_ACCESSIONS_ACROSS_TWO_CHUNKS = 10_001

@EndpointTest
class UploadDatabaseServiceTest(
    @Autowired private val uploadDatabaseService: UploadDatabaseService,
    @Autowired private val generateAccessionFromNumberService: GenerateAccessionFromNumberService,
    @Autowired private val dateProvider: DateProvider,
) {
    @Test
    fun `WHEN generating accessions for an original upload THEN assigns every row in set-based chunks`() {
        val targetUploadId = "target-upload"
        val otherUploadId = "other-upload"
        val authenticatedUser = mockk<AuthenticatedUser>()
        every { authenticatedUser.username } returns "test-user"
        val expectedSubmissionIds = (1..NUMBER_OF_ACCESSIONS_ACROSS_TWO_CHUNKS).map {
            "submission-$it"
        }

        insertMetadata(targetUploadId, expectedSubmissionIds, authenticatedUser)
        insertMetadata(otherUploadId, listOf("other-submission"), authenticatedUser)

        uploadDatabaseService.generateNewAccessionsForOriginalUpload(targetUploadId)

        val targetRows = getAuxRows(targetUploadId)
        assertEquals(NUMBER_OF_ACCESSIONS_ACROSS_TWO_CHUNKS, targetRows.size)
        assertEquals(expectedSubmissionIds.toSet(), targetRows.map { it.submissionId }.toSet())
        assertTrue(targetRows.all { it.version == 1L })

        val accessions = targetRows.map { it.accession }
        assertTrue(accessions.all { it != null && generateAccessionFromNumberService.validateAccession(it) })
        assertEquals(NUMBER_OF_ACCESSIONS_ACROSS_TWO_CHUNKS, accessions.toSet().size)

        val otherRow = getAuxRows(otherUploadId).single()
        assertNull(otherRow.accession)
        assertNull(otherRow.version)
    }

    private fun insertMetadata(uploadId: String, submissionIds: List<String>, authenticatedUser: AuthenticatedUser) {
        uploadDatabaseService.batchInsertMetadataInAuxTable(
            uploadId = uploadId,
            authenticatedUser = authenticatedUser,
            groupId = 1,
            submittedOrganism = Organism(DEFAULT_ORGANISM),
            uploadedMetadataBatch = submissionIds.map {
                MetadataEntry(it, mapOf("field" to "value"))
            },
            uploadedAt = dateProvider.getCurrentDateTime(),
            files = null,
        )
    }

    private fun getAuxRows(uploadId: String): List<AuxRow> = transaction {
        MetadataUploadAuxTable
            .select(
                MetadataUploadAuxTable.submissionIdColumn,
                MetadataUploadAuxTable.accessionColumn,
                MetadataUploadAuxTable.versionColumn,
            )
            .where { MetadataUploadAuxTable.uploadIdColumn eq uploadId }
            .map {
                AuxRow(
                    submissionId = it[MetadataUploadAuxTable.submissionIdColumn],
                    accession = it[MetadataUploadAuxTable.accessionColumn],
                    version = it[MetadataUploadAuxTable.versionColumn],
                )
            }
    }

    private data class AuxRow(val submissionId: String, val accession: String?, val version: Long?)
}
