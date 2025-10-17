package org.loculus.backend.controller.submission

import kotlinx.datetime.DateTimeUnit.Companion.DAY
import kotlinx.datetime.DateTimeUnit.Companion.YEAR
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.api.Organism
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.ORGANISM_WITHOUT_CONSENSUS_SEQUENCES
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForSuperUser
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES
import org.loculus.backend.model.SubmitModel.AcceptedFileTypes.metadataFileTypes
import org.loculus.backend.model.SubmitModel.AcceptedFileTypes.sequenceFileTypes
import org.loculus.backend.service.submission.CompressionAlgorithm
import org.loculus.backend.utils.DateProvider
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.http.MediaType.APPLICATION_JSON
import org.springframework.http.MediaType.APPLICATION_PROBLEM_JSON
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.ResultMatcher
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.util.UUID
import kotlin.time.Clock

@EndpointTest
class SubmitEndpointTest(
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val backendConfig: BackendConfig,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
) {
    var groupId: Int = 0

    @BeforeEach
    fun prepareNewGroup() {
        groupId = groupManagementClient.createNewGroup().andGetGroupId()
    }

    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) { jwt ->
            submissionControllerClient.submit(
                DefaultFiles.metadataFile,
                DefaultFiles.sequencesFile,
                groupId = 123,
                jwt = jwt,
            )
        }
    }

    @Test
    fun `WHEN submitting on behalf of a non-existing group THEN expect that the group is not found`() {
        val groupId = 123456789

        submissionControllerClient.submit(
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFile,
            groupId = groupId,
        )
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("\$.detail", containsString("Group(s) $groupId do(es) not exist")))
    }

    @Test
    fun `WHEN submitting on behalf of a group that the user is not a member of THEN expect it is forbidden`() {
        val otherUser = "otherUser"

        submissionControllerClient.submit(
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFile,
            groupId = groupId,
            jwt = generateJwtFor(otherUser),
        )
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString(
                        "User $otherUser is not a member of group(s) " +
                                "$groupId. Action not allowed.",
                    ),
                ),
            )
    }

    @Test
    fun `WHEN superuser submits on behalf of some group THEN is accepted`() {
        submissionControllerClient.submit(
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFile,
            jwt = jwtForSuperUser,
            groupId = groupId,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(APPLICATION_JSON))
            .andExpect(jsonPath("\$.length()").value(NUMBER_OF_SEQUENCES))
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
            groupId = groupId,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(APPLICATION_JSON))
            .andExpect(jsonPath("\$.length()").value(NUMBER_OF_SEQUENCES))
            .andExpect(jsonPath("\$[0].submissionId").value("custom0"))
            .andExpect(jsonPath("\$[0].accession", containsString(backendConfig.accessionPrefix)))
            .andExpect(jsonPath("\$[0].version").value(1))
    }

    @Test
    fun `GIVEN valid input multi segment data THEN returns mapping of provided custom ids to generated ids`() {
        submissionControllerClient.submit(
            DefaultFiles.multiSegmentedMetadataFile,
            DefaultFiles.sequencesFileMultiSegmented,
            organism = OTHER_ORGANISM,
            groupId = groupId,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(APPLICATION_JSON))
            .andExpect(jsonPath("\$.length()").value(NUMBER_OF_SEQUENCES))
            .andExpect(jsonPath("\$[0].submissionId").value("custom0"))
            .andExpect(jsonPath("\$[0].accession", containsString(backendConfig.accessionPrefix)))
            .andExpect(jsonPath("\$[0].version").value(1))
    }

    @Test
    fun `GIVEN submission without data use terms THEN returns an error`() {
        submissionControllerClient.submitWithoutDataUseTerms(
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFileMultiSegmented,
            organism = OTHER_ORGANISM,
            groupId = groupId,
        )
            .andExpect(status().isBadRequest)
    }

    @Test
    fun `GIVEN submission with file mapping THEN returns an error`() {
        submissionControllerClient.submit(
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFileMultiSegmented,
            organism = OTHER_ORGANISM,
            groupId = groupId,
            fileMapping = mapOf("foo" to mapOf("bar" to listOf(FileIdAndName(UUID.randomUUID(), "baz")))),
        )
            .andExpect(status().isBadRequest)
            .andExpect(content().contentType(APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath(
                    "\$.detail",
                ).value(
                    "the otherOrganism organism does not support file submission.",
                ),
            )
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
            groupId = groupId,
        )
            .andExpect(expectedStatus)
            .andExpect(jsonPath("\$.title").value(expectedTitle))
            .andExpect(jsonPath("\$.detail", containsString(expectedMessage)))
    }

    @Test
    fun `GIVEN no sequence file for organism that requires one THEN returns bad request`() {
        submissionControllerClient.submit(
            metadataFile = DefaultFiles.metadataFile,
            sequencesFile = null,
            organism = DEFAULT_ORGANISM,
            groupId = groupId,
        )
            .andExpect(status().isBadRequest)
            .andExpect(content().contentType(APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath("\$.detail").value("Submissions for organism $DEFAULT_ORGANISM require a sequence file."),
            )
    }

    @Test
    fun `GIVEN sequence file for organism without consensus sequences THEN returns bad request`() {
        submissionControllerClient.submit(
            metadataFile = DefaultFiles.metadataFile,
            sequencesFile = DefaultFiles.sequencesFile,
            organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES,
            groupId = groupId,
        )
            .andExpect(status().isBadRequest)
            .andExpect(content().contentType(APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath(
                    "\$.detail",
                ).value("Sequence uploads are not allowed for organism $ORGANISM_WITHOUT_CONSENSUS_SEQUENCES."),
            )
    }

    @Test
    fun `GIVEN no sequence file for organism without consensus sequences THEN data is accepted`() {
        submissionControllerClient.submit(
            metadataFile = DefaultFiles.metadataFile,
            sequencesFile = null,
            organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES,
            groupId = groupId,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(APPLICATION_JSON))
            .andExpect(jsonPath("\$.length()").value(NUMBER_OF_SEQUENCES))
            .andExpect(jsonPath("\$[0].submissionId").value("custom0"))
            .andExpect(jsonPath("\$[0].accession", containsString(backendConfig.accessionPrefix)))
            .andExpect(jsonPath("\$[0].version").value(1))
    }

    companion object {

        @JvmStatic
        fun compressionForSubmit(): List<Arguments> = listOf(
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

        @JvmStatic
        fun badRequestForSubmit(): List<Arguments> {
            val now = Clock.System.now().toLocalDateTime(DateProvider.timeZone).date

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
                    "Submissions for organism $DEFAULT_ORGANISM require a sequence file.",
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
                            ".${
                                metadataFileTypes.getCompressedExtensions().filterKeys { it!=CompressionAlgorithm.NONE }
                                    .flatMap { it.value }.joinToString(", .")
                            } for compressed submissions",
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
                            ".${
                                sequenceFileTypes.getCompressedExtensions().filterKeys { it!=CompressionAlgorithm.NONE }
                                    .flatMap { it.value }.joinToString(", .")
                            } for compressed submissions",
                    DEFAULT_ORGANISM,
                    DataUseTerms.Open,
                ),
                Arguments.of(
                    "metadata file where one row has a blank header",
                    SubmitFiles.metadataFileWith(
                        content = """
                            id	firstColumn
                            	someValueButNoHeader
                            someHeader2	someValue2
                        """.trimIndent(),
                    ),
                    DefaultFiles.sequencesFile,
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "A row in metadata file contains no id",
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
                    "The metadata file does not contain either header 'id' or 'submissionId'",
                    DEFAULT_ORGANISM,
                    DataUseTerms.Open,
                ),
                Arguments.of(
                    "duplicate headers in metadata file",
                    SubmitFiles.metadataFileWith(
                        content = """
                            id	firstColumn
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
                    "Sequence file contains 1 ids that are not present in the metadata file: notInMetadata",
                    DEFAULT_ORGANISM,
                    DataUseTerms.Open,
                ),
                Arguments.of(
                    "sequence file misses headers",
                    SubmitFiles.metadataFileWith(
                        content = """
                            id	firstColumn
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
                    "Metadata file contains 1 ids that are not present in the sequence file: notInSequences",
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
                            "name in the format <id>_<segment name>",
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

    @Test
    fun `GIVEN metadata file with old submissionId header THEN submission still works (BACKCOMPAT)`() {
        val metadataWithSubmissionId = SubmitFiles.metadataFileWith(
            content = """
                submissionId	date	region	country	division	host
                custom0	2020-12-26	Europe	Switzerland	Bern	Homo sapiens
                custom1	2020-12-15	Europe	Switzerland	Schaffhausen	Homo sapiens
            """.trimIndent(),
        )

        val sequencesFile = SubmitFiles.sequenceFileWith(
            content = """
                >custom0
                ACTG
                >custom1
                ACTG
            """.trimIndent(),
        )

        submissionControllerClient.submit(
            metadataWithSubmissionId,
            sequencesFile,
            groupId = groupId,
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$[0].submissionId").value("custom0"))
            .andExpect(jsonPath("\$[1].submissionId").value("custom1"))
    }

    @Test
    fun `GIVEN metadata file with both id and submissionId headers THEN submission fails`() {
        val metadataWithBothHeaders = SubmitFiles.metadataFileWith(
            content = """
                id	submissionId	date	region	country	division	host
                custom0	custom0	2020-12-26	Europe	Switzerland	Bern	Homo sapiens
                custom1	custom1	2020-12-15	Europe	Switzerland	Schaffhausen	Homo sapiens
            """.trimIndent(),
        )

        val sequencesFile = SubmitFiles.sequenceFileWith(
            content = """
                >custom0_main
                ACTG
                >custom1_main
                ACTG
            """.trimIndent(),
        )

        submissionControllerClient.submit(
            metadataWithBothHeaders,
            sequencesFile,
            groupId = groupId,
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath("\$.detail").value(
                    "The metadata file contains both 'id' and 'submissionId'. Only one is allowed.",
                ),
            )
    }
}
