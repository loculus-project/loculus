package org.pathoplexus.backend.controller

import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType.APPLICATION_JSON_VALUE
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.ResultMatcher
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class SubmitEndpointTest(@Autowired val submissionControllerClient: SubmissionControllerClient) {
    @Test
    fun `GIVEN valid input data THEN returns mapping of provided custom ids to generated ids`() {
        submissionControllerClient.submit(
            "testUser",
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFile,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(NUMBER_OF_SEQUENCES))
            .andExpect(jsonPath("\$[0].submissionId").value("custom0"))
            .andExpect(jsonPath("\$[0].accession").value(DefaultFiles.firstAccession))
            .andExpect(jsonPath("\$[0].version").value(1))
    }

    @Test
    fun `GIVEN fasta data with unknown segment THEN data is accepted to let the preprocessing pipeline verify it`() {
        submissionControllerClient.submit(
            "testUser",
            SubmitFiles.metadataFileWith(
                content = """
                    submissionId	firstColumn
                    commonHeader	someValue
                """.trimIndent(),
            ),
            SubmitFiles.sequenceFileWith(
                content = """
                    >commonHeader_nonExistingSegmentName
                    AC
                """.trimIndent(),
            ),
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(1))
    }

    @ParameterizedTest(name = "GIVEN {0} THEN throws error \"{5}\"")
    @MethodSource("badRequestForSubmit")
    fun `GIVEN invalid data THEN throws bad request`(
        title: String,
        metadataFile: MockMultipartFile,
        sequencesFile: MockMultipartFile,
        expectedStatus: ResultMatcher,
        expectedTitle: String,
        expectedMessage: String,
    ) {
        submissionControllerClient.submit("testUser", metadataFile, sequencesFile)
            .andExpect(expectedStatus)
            .andExpect(jsonPath("\$.title").value(expectedTitle))
            .andExpect(jsonPath("\$.detail", containsString(expectedMessage)))
    }

    companion object {
        @JvmStatic
        fun badRequestForSubmit(): List<Arguments> {
            return listOf(
                Arguments.of(
                    "metadata file with wrong submitted filename",
                    SubmitFiles.metadataFileWith(name = "notMetadataFile"),
                    DefaultFiles.sequencesFile,
                    status().isBadRequest,
                    "Bad Request",
                    "Required part 'metadataFile' is not present.",
                ),
                Arguments.of(
                    "sequences file with wrong submitted filename",
                    DefaultFiles.metadataFile,
                    SubmitFiles.sequenceFileWith(name = "notSequencesFile"),
                    status().isBadRequest,
                    "Bad Request",
                    "Required part 'sequenceFile' is not present.",
                ),
                Arguments.of(
                    "wrong extension for metadata file",
                    SubmitFiles.metadataFileWith(originalFilename = "metadata.wrongExtension"),
                    DefaultFiles.sequencesFile,
                    status().isBadRequest,
                    "Bad Request",
                    "Metadata file must have extension .tsv",
                ),
                Arguments.of(
                    "wrong extension for sequences file",
                    DefaultFiles.metadataFile,
                    SubmitFiles.sequenceFileWith(originalFilename = "sequences.wrongExtension"),
                    status().isBadRequest,
                    "Bad Request",
                    "Sequence file must have extension .fasta",
                ),
                Arguments.of(
                    "metadata file where one row has a blank header",
                    SubmitFiles.metadataFileWith(
                        content = """
                            submissionId	firstColumn
                            	someValueButNoHeader
                            someHeader2	someValue2
                        """.trimIndent(),
                    ),
                    DefaultFiles.sequencesFile,
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "A row in metadata file contains no submissionId",
                ),
                Arguments.of(
                    "metadata file with no header",
                    SubmitFiles.metadataFileWith(
                        content = """
                            firstColumn
                            someValue
                        """.trimIndent(),
                    ),
                    DefaultFiles.sequencesFile,
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "The metadata file does not contain the header 'submissionId'",
                ),
                Arguments.of(
                    "duplicate headers in metadata file",
                    SubmitFiles.metadataFileWith(
                        content = """
                            submissionId	firstColumn
                            sameHeader	someValue
                            sameHeader	someValue2
                        """.trimIndent(),
                    ),
                    DefaultFiles.sequencesFile,
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "Metadata file contains duplicate submissionIds: [sameHeader]",
                ),
                Arguments.of(
                    "duplicate headers in sequence file",
                    DefaultFiles.metadataFile,
                    SubmitFiles.sequenceFileWith(
                        content = """
                            >sameHeader_main
                            AC
                            >sameHeader_main
                            AC
                        """.trimIndent(),
                    ),
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "Sequence file contains duplicate submissionIds: sameHeader",
                ),
                Arguments.of(
                    "metadata file misses headers",
                    SubmitFiles.metadataFileWith(
                        content = """
                            submissionId	firstColumn
                            commonHeader	someValue
                        """.trimIndent(),
                    ),
                    SubmitFiles.sequenceFileWith(
                        content = """
                            >commonHeader_main
                            AC
                            >notInMetadata_main
                            AC
                        """.trimIndent(),
                    ),
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "Sequence file contains submissionIds that are not present in the metadata file: [notInMetadata]",
                ),
                Arguments.of(
                    "sequence file misses headers",
                    SubmitFiles.metadataFileWith(
                        content = """
                            submissionId	firstColumn
                            commonHeader	someValue
                            notInSequences	someValue
                        """.trimIndent(),
                    ),
                    SubmitFiles.sequenceFileWith(
                        content = """
                            >commonHeader_main
                            AC
                        """.trimIndent(),
                    ),
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "Metadata file contains submissionIds that are not present in the sequence file: [notInSequences]",
                ),
                Arguments.of(
                    "FASTA header misses segment name",
                    SubmitFiles.metadataFileWith(
                        content = """
                            submissionId	firstColumn
                            commonHeader	someValue
                        """.trimIndent(),
                    ),
                    SubmitFiles.sequenceFileWith(
                        content = """
                            >commonHeader
                            AC
                        """.trimIndent(),
                    ),
                    status().isBadRequest,
                    "Bad Request",
                    "The FASTA header commonHeader does not contain the segment name. Please provide the segment " +
                        "name in the format <submissionId>_<segment name>",
                ),
            )
        }
    }
}
