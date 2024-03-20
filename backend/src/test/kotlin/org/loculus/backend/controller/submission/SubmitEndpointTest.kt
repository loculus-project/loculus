package org.loculus.backend.controller.submission

import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit.Companion.DAY
import kotlinx.datetime.DateTimeUnit.Companion.YEAR
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.Organism
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.controller.DEFAULT_GROUP_NAME
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES
import org.loculus.backend.model.SubmitModel.AcceptedFileTypes.metadataFileTypes
import org.loculus.backend.model.SubmitModel.AcceptedFileTypes.sequenceFileTypes
import org.loculus.backend.service.submission.CompressionAlgorithm
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType.APPLICATION_JSON_VALUE
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.ResultMatcher
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class SubmitEndpointTest(
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val backendConfig: BackendConfig,
) {

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

    @Test
    fun `WHEN submitting on behalf of a non-existing group THEN expect that the group is not found`() {
        submissionControllerClient.submit(
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFile,
            groupName = "nonExistingGroup",
        )
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.detail", containsString("Group(s) nonExistingGroup do not exist")))
    }

    @Test
    fun `WHEN submitting on behalf of a group that the user is not a member of THEN expect it is forbidden`() {
        val otherUser = "otherUser"

        submissionControllerClient.submit(
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFile,
            jwt = generateJwtFor(otherUser),
        )
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString(
                        "User $otherUser is not a member of group(s) " +
                            "$DEFAULT_GROUP_NAME. Action not allowed.",
                    ),
                ),
            )
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
            .andExpect(jsonPath("\$[0].accession", containsString(backendConfig.accessionPrefix)))
            .andExpect(jsonPath("\$[0].version").value(1))
    }

    @Test
    fun `GIVEN valid input multi segment data THEN returns mapping of provided custom ids to generated ids`() {
        submissionControllerClient.submit(
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFileMultiSegmented,
            organism = OTHER_ORGANISM,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(NUMBER_OF_SEQUENCES))
            .andExpect(jsonPath("\$[0].submissionId").value("custom0"))
            .andExpect(jsonPath("\$[0].accession", containsString(backendConfig.accessionPrefix)))
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
            organism = OTHER_ORGANISM,
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
        organism: Organism,
        dataUseTerm: DataUseTerms,
    ) {
        submissionControllerClient.submit(
            metadataFile,
            sequencesFile,
            organism = organism.name,
            dataUseTerm = dataUseTerm,
        )
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
            val now = Clock.System.now().toLocalDateTime(TimeZone.UTC).date

            return listOf(
                Arguments.of(
                    "metadata file with wrong submitted filename",
                    SubmitFiles.metadataFileWith(name = "notMetadataFile"),
                    DefaultFiles.sequencesFile,
                    status().isBadRequest,
                    "Bad Request",
                    "Required part 'metadataFile' is not present.",
                    DEFAULT_ORGANISM,
                    DataUseTerms.Open,
                ),
                Arguments.of(
                    "sequences file with wrong submitted filename",
                    DefaultFiles.metadataFile,
                    SubmitFiles.sequenceFileWith(name = "notSequencesFile"),
                    status().isBadRequest,
                    "Bad Request",
                    "Required part 'sequenceFile' is not present.",
                    DEFAULT_ORGANISM,
                    DataUseTerms.Open,
                ),
                Arguments.of(
                    "wrong extension for metadata file",
                    SubmitFiles.metadataFileWith(originalFilename = "metadata.wrongExtension"),
                    DefaultFiles.sequencesFile,
                    status().isBadRequest,
                    "Bad Request",
                    "${metadataFileTypes.displayName} has wrong extension. Must be " +
                        ".${metadataFileTypes.validExtensions.joinToString(", .")} for uncompressed submissions or " +
                        ".${metadataFileTypes.getCompressedExtensions().filterKeys { it != CompressionAlgorithm.NONE }
                            .flatMap { it.value }.joinToString(", .")} for compressed submissions",
                    DEFAULT_ORGANISM,
                    DataUseTerms.Open,
                ),
                Arguments.of(
                    "wrong extension for sequences file",
                    DefaultFiles.metadataFile,
                    SubmitFiles.sequenceFileWith(originalFilename = "sequences.wrongExtension"),
                    status().isBadRequest,
                    "Bad Request",
                    "${sequenceFileTypes.displayName} has wrong extension. Must be " +
                        ".${sequenceFileTypes.validExtensions.joinToString(", .")} for uncompressed submissions or " +
                        ".${sequenceFileTypes.getCompressedExtensions().filterKeys { it != CompressionAlgorithm.NONE }
                            .flatMap { it.value }.joinToString(", .")} for compressed submissions",
                    DEFAULT_ORGANISM,
                    DataUseTerms.Open,
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
                    DEFAULT_ORGANISM,
                    DataUseTerms.Open,
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
                    DEFAULT_ORGANISM,
                    DataUseTerms.Open,
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
                    DEFAULT_ORGANISM,
                    DataUseTerms.Open,
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
                    DEFAULT_ORGANISM,
                    DataUseTerms.Open,
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
                            >commonHeader
                            AC
                            >notInMetadata
                            AC
                        """.trimIndent(),
                    ),
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "Sequence file contains 1 submissionIds that are not present in the metadata file: notInMetadata",
                    DEFAULT_ORGANISM,
                    DataUseTerms.Open,
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
                            >commonHeader
                            AC
                        """.trimIndent(),
                    ),
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "Metadata file contains 1 submissionIds that are not present in the sequence file: notInSequences",
                    DEFAULT_ORGANISM,
                    DataUseTerms.Open,
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
                    OTHER_ORGANISM,
                    DataUseTerms.Open,
                ),
                Arguments.of(
                    "restricted use data with until date in the past",
                    DefaultFiles.metadataFile,
                    DefaultFiles.sequencesFile,
                    status().isBadRequest,
                    "Bad Request",
                    "The date 'restrictedUntil' must be in the future, up to a maximum of 1 year from now.",
                    DEFAULT_ORGANISM,
                    DataUseTerms.Restricted(now.minus(1, DAY)),

                ),
                Arguments.of(
                    "restricted use data with until date further than 1 year",
                    DefaultFiles.metadataFile,
                    DefaultFiles.sequencesFile,
                    status().isBadRequest,
                    "Bad Request",
                    "The date 'restrictedUntil' must not exceed 1 year from today.",
                    DEFAULT_ORGANISM,
                    DataUseTerms.Restricted(now.plus(2, YEAR)),
                ),
            )
        }
    }
}
