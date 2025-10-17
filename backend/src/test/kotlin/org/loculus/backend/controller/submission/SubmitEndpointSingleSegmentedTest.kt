package org.loculus.backend.controller.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.hasEntry
import org.junit.jupiter.api.Test
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.SINGLE_SEGMENTED_REFERENCE_GENOME
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType.APPLICATION_JSON_VALUE
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

private const val DEFAULT_SEQUENCE_NAME = "main"

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$SINGLE_SEGMENTED_REFERENCE_GENOME"],
)
class SubmitEndpointSingleSegmentedTest(
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val backendConfig: BackendConfig,
    @Autowired private val groupManagementClient: GroupManagementControllerClient,
) {
    @Test
    fun `GIVEN valid input data without segment name THEN data is accepted and shows segment name 'main'`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()

        submissionControllerClient.submit(
            SubmitFiles.metadataFileWith(
                content = """
                        submissionId	firstColumn
                        header1	someValue
                        header2	someValue
                """.trimIndent(),
            ),
            SubmitFiles.sequenceFileWith(
                content = """
                        >header1
                        AC
                        >header2
                        GT
                """.trimIndent(),
            ),
            groupId = groupId,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(2))
            .andExpect(jsonPath("\$[0].submissionId").value("header1"))
            .andExpect(jsonPath("\$[0].accession", containsString(backendConfig.accessionPrefix)))
            .andExpect(jsonPath("\$[0].version").value(1))

        val unalignedNucleotideSequences = convenienceClient.extractUnprocessedData()[0]
            .data
            .unalignedNucleotideSequences

        assertThat(unalignedNucleotideSequences, hasEntry(DEFAULT_SEQUENCE_NAME, "AC"))
    }

    @Test
    fun `GIVEN input data with explicit default segment name THEN data is rejected`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        val expectedDetail = "Metadata file contains 1 Fasta ids that are not present in the sequence file: header1"

        submissionControllerClient.submit(
            SubmitFiles.metadataFileWith(
                content = """
                        submissionId	firstColumn
                        header1	someValue
                """.trimIndent(),
            ),
            SubmitFiles.sequenceFileWith(
                content = """
                        >header1_$DEFAULT_SEQUENCE_NAME
                        AC
                """.trimIndent(),
            ),
            groupId = groupId,
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("\$.title").value("Unprocessable Entity"))
            .andExpect(jsonPath("\$.detail", containsString(expectedDetail)))
    }
}
