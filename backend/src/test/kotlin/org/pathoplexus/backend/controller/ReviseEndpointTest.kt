package org.pathoplexus.backend.controller

import org.hamcrest.Matchers
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
import org.pathoplexus.backend.service.Status.RECEIVED
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.ResultMatcher
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class ReviseEndpointTest(
    @Autowired val client: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {
    @Test
    fun `GIVEN sequences with status 'SILO_READY' THEN the status changes to 'RECEIVED' and returns HeaderIds`() {
        convenienceClient.prepareDefaultSequencesToSiloReady()

        client.reviseSequences(
            DefaultFiles.revisedMetadataFile,
            DefaultFiles.sequencesFile,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(DefaultFiles.NUMBER_OF_SEQUENCES))
            .andExpect(jsonPath("\$[0].customId").value("custom0"))
            .andExpect(jsonPath("\$[0].sequenceId").value(DefaultFiles.firstSequence))
            .andExpect(jsonPath("\$[0].version").value(2))

        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 2)
            .assertStatusIs(RECEIVED)
    }

    @Test
    fun `WHEN submitting revised data with non-existing sequenceIds THEN throws an unprocessableEntity error`() {
        convenienceClient.prepareDefaultSequencesToSiloReady()

        client.reviseSequences(
            SubmitFiles.revisedMetadataFileWith(
                content =
                """
                 sequenceId	header	firstColumn
                    123	someHeader	someValue
                    1	someHeader2	someOtherValue
                """.trimIndent(),
            ),
            SubmitFiles.sequenceFileWith(),
        ).andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "SequenceIds 123 do not exist",
                ),
            )
    }

    @Test
    fun `WHEN submitting revised data not from the submitter THEN throws forbidden error`() {
        convenienceClient.prepareDefaultSequencesToSiloReady()

        val notSubmitter = "notTheSubmitter"
        client.reviseSequences(
            DefaultFiles.revisedMetadataFile,
            DefaultFiles.sequencesFile,
            notSubmitter,
        )
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User '$notSubmitter' does not have right to change the sequence versions " +
                        "1.1",
                ),
            )
    }

    @Test
    fun `WHEN submitting revised data with latest version not 'SILO_READY' THEN throws an unprocessableEntity error`() {
        convenienceClient.prepareDefaultSequencesToNeedReview()

        client.reviseSequences(
            DefaultFiles.revisedMetadataFile,
            DefaultFiles.sequencesFile,
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Sequence versions are in not in one of the states [SILO_READY]: " +
                        "1.1 - NEEDS_REVIEW",
                ),
            )
    }

    @ParameterizedTest(name = "GIVEN {0} THEN throws error \"{5}\"")
    @MethodSource("badRequestForReview")
    fun `GIVEN invalid data THEN throws bad request`(
        title: String,
        metadataFile: MockMultipartFile,
        sequencesFile: MockMultipartFile,
        expectedStatus: ResultMatcher,
        expectedTitle: String,
        expectedMessage: String,
    ) {
        client.reviseSequences(metadataFile, sequencesFile)
            .andExpect(expectedStatus)
            .andExpect(jsonPath("\$.title").value(expectedTitle))
            .andExpect(jsonPath("\$.detail", Matchers.containsString(expectedMessage)))
    }

    companion object {
        @JvmStatic
        fun badRequestForReview(): List<Arguments> {
            return listOf(
                Arguments.of(
                    "metadata file with wrong submitted filename",
                    SubmitFiles.revisedMetadataFileWith(name = "notMetadataFile"),
                    SubmitFiles.sequenceFileWith(),
                    status().isBadRequest,
                    "Bad Request",
                    "Required part 'metadataFile' is not present.",
                ),
                Arguments.of(
                    "sequences file with wrong submitted filename",
                    SubmitFiles.revisedMetadataFileWith(),
                    SubmitFiles.sequenceFileWith(name = "notSequencesFile"),
                    status().isBadRequest,
                    "Bad Request",
                    "Required part 'sequenceFile' is not present.",
                ),
                Arguments.of(
                    "wrong extension for metadata file",
                    SubmitFiles.revisedMetadataFileWith(originalFilename = "metadata.wrongExtension"),
                    SubmitFiles.sequenceFileWith(),
                    status().isBadRequest,
                    "Bad Request",
                    "Metadata file must have extension .tsv",
                ),
                Arguments.of(
                    "wrong extension for sequences file",
                    SubmitFiles.revisedMetadataFileWith(),
                    SubmitFiles.sequenceFileWith(originalFilename = "sequences.wrongExtension"),
                    status().isBadRequest,
                    "Bad Request",
                    "Sequence file must have extension .fasta",
                ),
                Arguments.of(
                    "metadata file where one row has a blank header",
                    SubmitFiles.metadataFileWith(
                        content = """
                            sequenceId	header	firstColumn
                            1		someValueButNoHeader
                            2	someHeader2	someValue2
                        """.trimIndent(),
                    ),
                    SubmitFiles.sequenceFileWith(),
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "A row in metadata file contains no header",
                ),
                Arguments.of(
                    "metadata file with no header",
                    SubmitFiles.revisedMetadataFileWith(
                        content = """
                            sequenceId	firstColumn
                            1	someValue
                        """.trimIndent(),
                    ),
                    SubmitFiles.sequenceFileWith(),
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "The metadata file does not contain the header 'header'",
                ),
                Arguments.of(
                    "duplicate headers in metadata file",
                    SubmitFiles.revisedMetadataFileWith(
                        content = """
                            sequenceId	header	firstColumn
                            1	sameHeader	someValue
                            2	sameHeader	someValue2
                        """.trimIndent(),
                    ),
                    SubmitFiles.sequenceFileWith(),
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "Metadata file contains duplicate headers: [sameHeader]",
                ),
                Arguments.of(
                    "duplicate headers in sequence file",
                    SubmitFiles.revisedMetadataFileWith(),
                    SubmitFiles.sequenceFileWith(
                        content = """
                            >sameHeader
                            AC
                            >sameHeader
                            AC
                        """.trimIndent(),
                    ),
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "Sequence file contains duplicate headers: [sameHeader]",
                ),
                Arguments.of(
                    "metadata file misses headers",
                    SubmitFiles.metadataFileWith(
                        content = """
                            sequenceId	header	firstColumn
                            1	commonHeader	someValue
                        """.trimIndent(),
                    ),
                    SubmitFiles.sequenceFileWith(
                        content = """
                            >commonHeader
                            AC
                            >notInMetadata
                            AC
                        """.trimIndent(),
                    ),
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "Sequence file contains headers that are not present in the metadata file: [notInMetadata]",
                ),
                Arguments.of(
                    "sequence file misses headers",
                    SubmitFiles.metadataFileWith(
                        content = """
                            sequenceId	header	firstColumn
                            1	commonHeader	someValue
                            2	notInSequences	someValue
                        """.trimIndent(),
                    ),
                    SubmitFiles.sequenceFileWith(
                        content = """
                            >commonHeader
                            AC
                        """.trimIndent(),
                    ),
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "Metadata file contains headers that are not present in the sequence file: [notInSequences]",
                ),
                Arguments.of(
                    "metadata file misses sequenceId header",
                    SubmitFiles.metadataFileWith(
                        content = """
                            header	firstColumn
                            someHeader	someValue
                            someHeader2	someValue
                        """.trimIndent(),
                    ),
                    SubmitFiles.sequenceFileWith(),
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "Metadata file misses header sequenceId",
                ),
                Arguments.of(
                    "metadata file with one row with missing sequenceId",
                    SubmitFiles.metadataFileWith(
                        content = """
                            sequenceId	header	firstColumn
                            	someHeader	someValue
                            2	someHeader2	someValue
                        """.trimIndent(),
                    ),
                    SubmitFiles.sequenceFileWith(),
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "A row with header 'someHeader' in metadata file contains no sequenceId",
                ),

                Arguments.of(
                    "metadata file with one row with sequenceId which is not a number",
                    SubmitFiles.metadataFileWith(
                        content = """
                            sequenceId	header	firstColumn
                            abc	someHeader	someValue
                            2	someHeader2	someValue
                        """.trimIndent(),
                    ),
                    SubmitFiles.sequenceFileWith(),
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "A row with header 'someHeader' in metadata file contains no valid sequenceId: abc",
                ),
            )
        }
    }
}
