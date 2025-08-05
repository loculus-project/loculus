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
}
