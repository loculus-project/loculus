package org.loculus.backend.controller.submission

import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.service.submission.CompressionAlgorithm
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType.APPLICATION_PROBLEM_JSON
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
@TestPropertySource(
    properties = [
        "loculus.submission.max-metadata-file-size-bytes=100",
        "loculus.submission.max-sequence-file-size-bytes=200",
        "loculus.submission.max-uncompressed-sequence-size-bytes=300",
    ],
)
class FileSizeLimitsTest(
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
) {
    var groupId: Int = 0

    @BeforeEach
    fun prepareNewGroup() {
        groupId = groupManagementClient.createNewGroup().andGetGroupId()
    }

    @Test
    fun `WHEN metadata file exceeds configured limit THEN returns PayloadTooLarge error`() {
        val largeMetadataContent = "submissionId\tfirstColumn\n" + "x".repeat(200) // Exceeds 100 byte limit
        val largeMetadataFile = SubmitFiles.metadataFileWith(content = largeMetadataContent)

        submissionControllerClient.submit(
            metadataFile = largeMetadataFile,
            sequencesFile = SubmitFiles.DefaultFiles.sequencesFile,
            groupId = groupId,
        )
            .andExpect(status().isPayloadTooLarge)
            .andExpect(content().contentType(APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.detail", containsString("metadata file is too large. Max 100B")))
    }

    @Test
    fun `WHEN sequence file exceeds configured limit THEN returns PayloadTooLarge error`() {
        val largeSequenceContent = ">custom0\n" + "A".repeat(300) // Exceeds 200 byte limit
        val largeSequenceFile = SubmitFiles.sequenceFileWith(content = largeSequenceContent)

        // Use small metadata file to avoid hitting metadata limit first
        val smallMetadata = "submissionId\tfirstColumn\ncustom0\tval" // Under 100 bytes
        val smallMetadataFile = SubmitFiles.metadataFileWith(content = smallMetadata)

        submissionControllerClient.submit(
            metadataFile = smallMetadataFile,
            sequencesFile = largeSequenceFile,
            groupId = groupId,
        )
            .andExpect(status().isPayloadTooLarge)
            .andExpect(content().contentType(APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.detail", containsString("sequence file is too large. Max 200B")))
    }

    @Test
    fun `WHEN uncompressed sequence data exceeds configured limit THEN returns PayloadTooLarge error`() {
        // Create small compressed file that expands beyond 300 bytes when parsed
        // ~308 bytes total when parsed
        val largeUncompressedSequences =
            ">c0\n" + "A".repeat(100) + "\n>c1\n" + "C".repeat(100) + "\n>c2\n" + "G".repeat(100)

        // Use compression to make the actual file size smaller than our limits
        val compressedSequenceFile = SubmitFiles.sequenceFileWith(
            content = largeUncompressedSequences,
            compression = CompressionAlgorithm.GZIP,
        )

        // Matching metadata
        val smallMetadata = "submissionId\tfirstColumn\nc0\tv0\nc1\tv1\nc2\tv2" // Under 100 bytes
        val smallMetadataFile = SubmitFiles.metadataFileWith(content = smallMetadata)

        submissionControllerClient.submit(
            metadataFile = smallMetadataFile,
            sequencesFile = compressedSequenceFile,
            groupId = groupId,
        )
            .andExpect(status().isPayloadTooLarge)
            .andExpect(content().contentType(APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.detail", containsString("Uncompressed sequence data exceeds maximum allowed size")))
    }

    @Test
    fun `WHEN files are within configured limits THEN submission succeeds`() {
        val smallMetadata = "submissionId\tfirstColumn\ncustom0\tvalue" // Under 100 bytes
        val smallSequence = ">custom0\nACGT" // Under 200 bytes and under 300 bytes uncompressed

        val metadataFile = SubmitFiles.metadataFileWith(content = smallMetadata)
        val sequenceFile = SubmitFiles.sequenceFileWith(content = smallSequence)

        submissionControllerClient.submit(
            metadataFile = metadataFile,
            sequencesFile = sequenceFile,
            groupId = groupId,
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].submissionId").value("custom0"))
    }

    @Test
    fun `WHEN revise metadata file exceeds configured limit THEN returns PayloadTooLarge error`() {
        val largeMetadataContent = "accession\tsubmissionId\tfirstColumn\n" + "acc1\tcustom0\t" + "x".repeat(200)
        val largeMetadataFile = SubmitFiles.revisedMetadataFileWith(content = largeMetadataContent)

        submissionControllerClient.reviseSequenceEntries(
            metadataFile = largeMetadataFile,
            sequencesFile = SubmitFiles.DefaultFiles.sequencesFile,
        )
            .andExpect(status().isPayloadTooLarge)
            .andExpect(content().contentType(APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.detail", containsString("metadata file is too large. Max 100B")))
    }

    @Test
    fun `WHEN revise sequence file exceeds configured limit THEN returns PayloadTooLarge error`() {
        val largeSequenceContent = ">custom0\n" + "A".repeat(300)
        val largeSequenceFile = SubmitFiles.sequenceFileWith(content = largeSequenceContent)

        val smallMetadata = "accession\tsubmissionId\tfirstColumn\nacc1\tcustom0\tval"
        val smallMetadataFile = SubmitFiles.revisedMetadataFileWith(content = smallMetadata)

        submissionControllerClient.reviseSequenceEntries(
            metadataFile = smallMetadataFile,
            sequencesFile = largeSequenceFile,
        )
            .andExpect(status().isPayloadTooLarge)
            .andExpect(content().contentType(APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.detail", containsString("sequence file is too large. Max 200B")))
    }
}
