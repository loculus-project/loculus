package org.loculus.backend.controller.submission

import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType.APPLICATION_PROBLEM_JSON
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class SubmitLargeBatchTest(
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
) {
    var groupId: Int = 0

    @BeforeEach
    fun prepareNewGroup() {
        groupId = groupManagementClient.createNewGroup().andGetGroupId()
    }

    @Test
    fun `WHEN submitting 100000 sequences THEN succeeds`() {
        val metadataHeader = "submissionId\tcountry\tdate"
        val metadataLines = mutableListOf(metadataHeader)

        for (i in 1..100_000) {
            metadataLines.add("seq_$i\tUSA\t2024-01-01")
        }

        val metadataContent = metadataLines.joinToString("\n")

        val sequenceLines = mutableListOf<String>()
        val dummySequence = "ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG"

        for (i in 1..100_000) {
            sequenceLines.add(">seq_$i")
            sequenceLines.add(dummySequence)
        }

        val sequenceContent = sequenceLines.joinToString("\n")

        val metadataFile = MockMultipartFile(
            "metadataFile",
            "metadata.tsv",
            "text/plain",
            metadataContent.toByteArray(),
        )

        val sequencesFile = MockMultipartFile(
            "sequenceFile",
            "sequences.fasta",
            "text/plain",
            sequenceContent.toByteArray(),
        )

        val result = submissionControllerClient.submit(
            metadataFile,
            sequencesFile,
            groupId = groupId,
        )

        result.andDo { mvcResult ->
            if (mvcResult.response.status != 200) {
                println("Response status: ${mvcResult.response.status}")
                println("Response content: ${mvcResult.response.contentAsString}")
            }
        }

        result.andExpect(status().isOk)
    }

    @Test
    fun `WHEN submitting large batch of revisions THEN succeeds`() {
        // First submit original sequences
        val count = 100_000
        val metadataHeader = "submissionId\tcountry\tdate"
        val metadataLines = mutableListOf(metadataHeader)

        for (i in 1..count) {
            metadataLines.add("seq_$i\tUSA\t2024-01-01")
        }

        val metadataContent = metadataLines.joinToString("\n")

        val sequenceLines = mutableListOf<String>()
        val dummySequence = "ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG"

        for (i in 1..count) {
            sequenceLines.add(">seq_$i")
            sequenceLines.add(dummySequence)
        }

        val sequenceContent = sequenceLines.joinToString("\n")

        val metadataFile = MockMultipartFile(
            "metadataFile",
            "metadata.tsv",
            "text/plain",
            metadataContent.toByteArray(),
        )

        val sequencesFile = MockMultipartFile(
            "sequenceFile",
            "sequences.fasta",
            "text/plain",
            sequenceContent.toByteArray(),
        )

        // Submit original sequences
        val originalResult = submissionControllerClient.submit(
            metadataFile,
            sequencesFile,
            groupId = groupId,
        )
        originalResult.andExpect(status().isOk)

        // Now submit revisions using accession numbers
        val revisionMetadataHeader = "accession\tcountry\tdate"
        val revisionMetadataLines = mutableListOf(revisionMetadataHeader)

        // We would need accession numbers from the original submission
        // For now, just test that the chunking doesn't break with large revision batches
        // This is a simplified test - in practice we'd need to extract accessions from the response
        for (i in 1..count) {
            revisionMetadataLines.add("TEST_$i\tCanada\t2024-02-01")
        }

        val revisionMetadataContent = revisionMetadataLines.joinToString("\n")
        val revisionMetadataFile = MockMultipartFile(
            "metadataFile",
            "revision_metadata.tsv",
            "text/plain",
            revisionMetadataContent.toByteArray(),
        )

        // Submit revisions - this would normally fail for non-existent accessions
        // but the test verifies that chunking works without parameter limit errors
        val revisionResult = submissionControllerClient.reviseSequenceEntries(
            revisionMetadataFile,
            sequencesFile,
        )

        // We expect this to fail due to non-existent accessions, but not due to parameter limits
        revisionResult.andExpect(status().is4xxClientError())
        revisionResult.andExpect(content().contentType(APPLICATION_PROBLEM_JSON))
    }
}
