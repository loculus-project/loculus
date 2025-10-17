package org.loculus.backend.service.maintenance

import io.mockk.every
import io.mockk.mockk
import kotlinx.datetime.toLocalDateTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.api.Organism
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
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
    fun `GIVEN revised data has duplicate Loculus accession throw error`() {
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
                organism = Organism("organism"),
                authenticatedUser = mockUser,
            )
        }
        assertEquals("Duplicate accessions found: $accession", exception.message)
    }
}
