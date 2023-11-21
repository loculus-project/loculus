package org.pathoplexus.backend.controller

import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES
import org.pathoplexus.backend.model.SubmitModel
import org.pathoplexus.backend.service.CompressionAlgorithm
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
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) { jwt ->
            submissionControllerClient.submit(
                DefaultFiles.metadataFile,
                DefaultFiles.sequencesFile,
                jwt = jwt,
            )
        }
    }

    @ParameterizedTest(name = "GIVEN {0} THEN data is accepted and submitted")
    @MethodSource("compressionForSubmit")
    fun `GIVEN valid input data THEN returns mapping of provided custom ids to generated ids`(
        title: String,
        metadataFile: MockMultipartFile,
        sequencesFile: MockMultipartFile,
    ) {
        submissionControllerClient.submit(
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
        submissionControllerClient.submit(metadataFile, sequencesFile)
            .andExpect(expectedStatus)
            .andExpect(jsonPath("\$.title").value(expectedTitle))
            .andExpect(jsonPath("\$.detail", containsString(expectedMessage)))
    }

    companion object {
        @JvmStatic
        fun compressionForSubmit(): List<Arguments> {
            return listOf(
                Arguments.of(
                    "uncompressed files",
                    DefaultFiles.metadataFile,
                    DefaultFiles.sequencesFile,
                ),
                Arguments.of(
                    "ZSTD compressed metadata file",
                    DefaultFiles.metadataFiles[CompressionAlgorithm.ZSTD],
                    DefaultFiles.sequencesFile,
                ),
                Arguments.of(
                    "ZSTD compressed sequences file",
                    DefaultFiles.metadataFile,
                    DefaultFiles.sequencesFiles[CompressionAlgorithm.ZSTD],
                ),
            ) +
                CompressionAlgorithm.entries.map { compression ->
                    Arguments.of(
                        "${compression.name} compressed metadata file and sequences file",
                        DefaultFiles.metadataFiles[compression],
                        DefaultFiles.sequencesFiles[compression],
                    )
                }
        }

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
                    "${SubmitModel.AcceptedFileTypes.metadataFile.displayName} has wrong extension. Must be " +
                        ".${SubmitModel.AcceptedFileTypes.metadataFile.validExtensions} for uncompressed " +
                        "submissions or .${SubmitModel.AcceptedFileTypes.metadataFile.getCompressedExtensions()} " +
                        "for compressed submissions",
                ),
                Arguments.of(
                    "wrong extension for sequences file",
                    DefaultFiles.metadataFile,
                    SubmitFiles.sequenceFileWith(originalFilename = "sequences.wrongExtension"),
                    status().isBadRequest,
                    "Bad Request",
                    "${SubmitModel.AcceptedFileTypes.sequenceFile.displayName} has wrong extension. Must be " +
                        ".${SubmitModel.AcceptedFileTypes.sequenceFile.validExtensions} for uncompressed " +
                        "submissions or .${SubmitModel.AcceptedFileTypes.sequenceFile.getCompressedExtensions()} " +
                        "for compressed submissions",
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
                    "Metadata file contains at least one duplicate submissionId",
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
                    "Sequence file contains at least one duplicate submissionId",
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
                    "Sequence file contains 1 submissionIds that are not present in the metadata file: notInMetadata",
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
                    "Metadata file contains 1 submissionIds that are not present in the sequence file: notInSequences",
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
