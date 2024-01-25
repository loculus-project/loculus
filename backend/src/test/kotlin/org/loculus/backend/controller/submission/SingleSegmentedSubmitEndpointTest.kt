package org.loculus.backend.controller.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.hasEntry
import org.junit.jupiter.api.Test
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType.APPLICATION_JSON_VALUE
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

const val SINGLE_SEGMENTED_REFERENCE_GENOME = "src/test/resources/backend_config_single_segment.json"

private const val DEFAULT_SEQUENCE_NAME = "main"

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$SINGLE_SEGMENTED_REFERENCE_GENOME"],
)
class SingleSegmentedSubmitEndpointTest(
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {
    @Test
    fun `GIVEN valid input data without segment name THEN data is accepted and shows segment name 'main'`() {
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
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(2))
            .andExpect(jsonPath("\$[0].submissionId").value("header1"))
            .andExpect(jsonPath("\$[0].accession").value(DefaultFiles.firstAccession))
            .andExpect(jsonPath("\$[0].version").value(1))

        val unalignedNucleotideSequences = convenienceClient.extractUnprocessedData()[0]
            .data
            .unalignedNucleotideSequences

        assertThat(unalignedNucleotideSequences, hasEntry(DEFAULT_SEQUENCE_NAME, "AC"))
    }

    @Test
    fun `GIVEN input data with explicit default segment name THEN data is rejected`() {
        val expectedDetail = "Metadata file contains 1 submissionIds that are not present in the sequence file: header1"

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
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("\$.title").value("Unprocessable Entity"))
            .andExpect(jsonPath("\$.detail", containsString(expectedDetail)))
    }
}
