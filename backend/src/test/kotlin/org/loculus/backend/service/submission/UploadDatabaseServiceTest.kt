package org.loculus.backend.service.maintenance

import io.mockk.every
import io.mockk.mockk
import kotlinx.datetime.toLocalDateTime
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.api.Organism
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.service.submission.MetadataUploadAuxTable
import org.loculus.backend.service.submission.UploadDatabaseService
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.RevisionEntry
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class UploadDatabaseServiceTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val uploadDatabaseService: UploadDatabaseService,
    @Autowired val dateProvider: DateProvider,
) {

    @Test
    fun `GIVEN data to revise has duplicate Loculus accession throw error`() {
        val uploadId = "upload id"
        val mockUser = mockk<AuthenticatedUser>()
        every { mockUser.username }.returns("username")
        val now = dateProvider.getCurrentInstant().toLocalDateTime(DateProvider.timeZone)
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(
            username = mockUser.username,
            organism = Organism("dummyOrganism").name,
        )
        val accession = accessionVersions[0].accession
        uploadDatabaseService.batchInsertRevisedMetadataInAuxTable(
            uploadId = uploadId,
            authenticatedUser = mockUser,
            submittedOrganism = Organism("dummyOrganism"),
            uploadedRevisedMetadataBatch = listOf(
                RevisionEntry("id1", accession, mapOf("key" to "value")),
                RevisionEntry("id2", accession, mapOf("key" to "value")),
            ),
            uploadedAt = now,
            null,
        )
        val exception = assertThrows<UnprocessableEntityException> {
            uploadDatabaseService.associateRevisedDataWithExistingSequenceEntries(
                uploadId = uploadId,
                organism = Organism("dummyOrganism"),
                authenticatedUser = mockUser,
            )
        }
        assertEquals("Duplicate accessions found: $accession", exception.message)
    }

    @Test
    fun `GIVEN data to revise has missing Loculus accession throw error`() {
        val uploadId = "upload id"
        val mockUser = mockk<AuthenticatedUser>()
        every { mockUser.username }.returns("username")
        val now = dateProvider.getCurrentInstant().toLocalDateTime(DateProvider.timeZone)
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(
            username = mockUser.username,
            organism = Organism("dummyOrganism").name,
        )
        val accession = accessionVersions[0].accession
        uploadDatabaseService.batchInsertRevisedMetadataInAuxTable(
            uploadId = uploadId,
            authenticatedUser = mockUser,
            submittedOrganism = Organism("dummyOrganism"),
            uploadedRevisedMetadataBatch = listOf(
                RevisionEntry("id1", "missing_accession", mapOf("key" to "value")),
                RevisionEntry("id2", accession, mapOf("key" to "value")),
            ),
            uploadedAt = now,
            null,
        )
        val exception = assertThrows<UnprocessableEntityException> {
            uploadDatabaseService.associateRevisedDataWithExistingSequenceEntries(
                uploadId = uploadId,
                organism = Organism("dummyOrganism"),
                authenticatedUser = mockUser,
            )
        }
        assertEquals("Accessions missing_accession do not exist", exception.message)
    }

    @Test
    fun `GIVEN data to revise has existing Loculus accession update auxTable`() {
        val uploadId = "upload id"
        val mockUser = mockk<AuthenticatedUser>()
        every { mockUser.isSuperUser }.returns(true)
        every { mockUser.username }.returns("username")
        val now = dateProvider.getCurrentInstant().toLocalDateTime(DateProvider.timeZone)
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(
            username = mockUser.username,
            organism = Organism("dummyOrganism").name,
        )
        val accession1 = accessionVersions[0].accession
        val accession2 = accessionVersions[1].accession
        uploadDatabaseService.batchInsertRevisedMetadataInAuxTable(
            uploadId = uploadId,
            authenticatedUser = mockUser,
            submittedOrganism = Organism("dummyOrganism"),
            uploadedRevisedMetadataBatch = listOf(
                RevisionEntry("id1", accession1, mapOf("key" to "value")),
                RevisionEntry("id2", accession2, mapOf("key" to "value")),
            ),
            uploadedAt = now,
            null,
        )
        uploadDatabaseService.associateRevisedDataWithExistingSequenceEntries(
            uploadId = uploadId,
            organism = Organism("dummyOrganism"),
            authenticatedUser = mockUser,
        )
        transaction {
            val results = MetadataUploadAuxTable.select(MetadataUploadAuxTable.versionColumn)
                .where {
                    MetadataUploadAuxTable.accessionColumn inList listOf(accession1, accession2)
                }
                .map { it[MetadataUploadAuxTable.versionColumn] }

            assertEquals(2, results.size, "Expected exactly two rows")

            assertTrue(results.all { it == 2L }, "Expected all version values to be 2, but got $results")
        }
    }
}
