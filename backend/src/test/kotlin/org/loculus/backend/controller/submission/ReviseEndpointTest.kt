package org.loculus.backend.controller.submission

import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.CoreMatchers.hasItem
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.allOf
import org.hamcrest.Matchers.hasProperty
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.backend.api.Status.APPROVED_FOR_RELEASE
import org.loculus.backend.api.Status.HAS_ERRORS
import org.loculus.backend.api.Status.RECEIVED
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.SUPER_USER_NAME
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.expectNdjsonAndGetContent
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForSuperUser
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
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
    @Autowired val groupManagementClient: GroupManagementControllerClient,
) {
    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            client.reviseSequenceEntries(
                DefaultFiles.dummyRevisedMetadataFile,
                DefaultFiles.sequencesFile,
                jwt = it,
            )
        }
    }

    @Test
    fun `WHEN superuser submits on behalf of other group THEN revised versions are created`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()

        val accessions = convenienceClient
            .prepareDataTo(APPROVED_FOR_RELEASE, username = DEFAULT_USER_NAME, groupId = groupId)
            .map { it.accession }

        client.reviseSequenceEntries(
            DefaultFiles.getRevisedMetadataFile(accessions),
            DefaultFiles.sequencesFile,
            jwt = jwtForSuperUser,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(DefaultFiles.NUMBER_OF_SEQUENCES))
            .andExpect(jsonPath("\$[0].submissionId").value("custom0"))
            .andExpect(jsonPath("\$[0].accession").value(accessions.first()))
            .andExpect(jsonPath("\$[0].version").value(2))

        val sequenceEntry = convenienceClient.getSequenceEntry(accession = accessions.first(), version = 2)
        assertThat(sequenceEntry.submitter, `is`(SUPER_USER_NAME))
    }

    @Test
    fun `GIVEN entries with status 'APPROVED_FOR_RELEASE' THEN there is a revised version and returns HeaderIds`() {
        val accessions = convenienceClient.prepareDataTo(APPROVED_FOR_RELEASE).map { it.accession }

        client.reviseSequenceEntries(
            DefaultFiles.getRevisedMetadataFile(accessions),
            DefaultFiles.sequencesFile,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(DefaultFiles.NUMBER_OF_SEQUENCES))
            .andExpect(jsonPath("\$[0].submissionId").value("custom0"))
            .andExpect(jsonPath("\$[0].accession").value(accessions.first()))
            .andExpect(jsonPath("\$[0].version").value(2))

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 2)
            .assertStatusIs(RECEIVED)
        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(APPROVED_FOR_RELEASE)

        val result = client.extractUnprocessedData(DefaultFiles.NUMBER_OF_SEQUENCES)
        val responseBody = result.expectNdjsonAndGetContent<UnprocessedData>()
        assertThat(responseBody, hasSize(10))

        assertThat(
            responseBody,
            hasItem(
                allOf(
                    hasProperty<UnprocessedData>("accession", `is`(accessions.first())),
                    hasProperty("version", `is`(2L)),
                ),
            ),
        )
    }

    @Test
    fun `WHEN submitting revised data with non-existing accessions THEN throws an unprocessableEntity error`() {
        val accessions = convenienceClient.prepareDataTo(APPROVED_FOR_RELEASE).map {
            it.accession
        }

        client.reviseSequenceEntries(
            SubmitFiles.revisedMetadataFileWith(
                content =
                """
                 accession	submissionId	firstColumn
                    123	someHeader_main	someValue
                    ${accessions.first()}	someHeader2_main	someOtherValue
                """.trimIndent(),
            ),
            SubmitFiles.sequenceFileWith(),
        ).andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accessions 123 do not exist",
                ),
            )
    }

    @Test
    fun `WHEN submitting revised data for wrong organism THEN throws an unprocessableEntity error`() {
        val accessions = convenienceClient.prepareDataTo(APPROVED_FOR_RELEASE, organism = DEFAULT_ORGANISM).map {
            it.accession
        }

        client.reviseSequenceEntries(
            DefaultFiles.getRevisedMetadataFile(accessions),
            DefaultFiles.sequencesFileMultiSegmented,
            organism = OTHER_ORGANISM,
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    containsString("accession versions are not of organism otherOrganism:"),
                ),
            )
    }

    @Test
    fun `WHEN submitting revised data not from the submitter THEN throws forbidden error`() {
        val accessions = convenienceClient.prepareDataTo(APPROVED_FOR_RELEASE).map { it.accession }

        val notSubmitter = "notTheSubmitter"
        client.reviseSequenceEntries(
            DefaultFiles.getRevisedMetadataFile(accessions),
            DefaultFiles.sequencesFile,
            jwt = generateJwtFor(notSubmitter),
        )
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("User $notSubmitter is not a member of group(s)"),
                ),
            )
    }

    @Test
    fun `WHEN submitting data with version not 'APPROVED_FOR_RELEASE' THEN throws an unprocessableEntity error`() {
        val accessions = convenienceClient.prepareDataTo(HAS_ERRORS).map { it.accession }

        client.reviseSequenceEntries(
            DefaultFiles.getRevisedMetadataFile(accessions),
            DefaultFiles.sequencesFile,
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString(
                        "Accession versions are in not in one of the states [APPROVED_FOR_RELEASE]: " +
                            "${accessions.first()}.1 - HAS_ERRORS,",
                    ),
                ),
            )
    }

    @ParameterizedTest(name = "GIVEN {0} THEN throws error \"{5}\"")
    @MethodSource("badRequestForRevision")
    fun `GIVEN invalid data THEN throws bad request`(
        title: String,
        metadataFile: MockMultipartFile,
        sequencesFile: MockMultipartFile,
        expectedStatus: ResultMatcher,
        expectedTitle: String,
        expectedMessage: String,
    ) {
        client.reviseSequenceEntries(metadataFile, sequencesFile)
            .andExpect(expectedStatus)
            .andExpect(jsonPath("\$.title").value(expectedTitle))
            .andExpect(jsonPath("\$.detail", containsString(expectedMessage)))
    }

    companion object {
        @JvmStatic
        fun badRequestForRevision(): List<Arguments> = listOf(
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
                "Metadata file has wrong extension.",
            ),
            Arguments.of(
                "wrong extension for sequences file",
                SubmitFiles.revisedMetadataFileWith(),
                SubmitFiles.sequenceFileWith(originalFilename = "sequences.wrongExtension"),
                status().isBadRequest,
                "Bad Request",
                "Sequence file has wrong extension.",
            ),
            Arguments.of(
                "metadata file where one row has a blank header",
                SubmitFiles.metadataFileWith(
                    content = """
                            accession	submissionId	firstColumn
                            1		someValueButNoHeader
                            2	someHeader2	someValue2
                    """.trimIndent(),
                ),
                SubmitFiles.sequenceFileWith(),
                status().isUnprocessableEntity,
                "Unprocessable Entity",
                "A row in metadata file contains no submissionId",
            ),
            Arguments.of(
                "metadata file with no header",
                SubmitFiles.revisedMetadataFileWith(
                    content = """
                            accession	firstColumn
                            1	someValue
                    """.trimIndent(),
                ),
                SubmitFiles.sequenceFileWith(),
                status().isUnprocessableEntity,
                "Unprocessable Entity",
                "The revised metadata file does not contain the header 'submissionId'",
            ),
            Arguments.of(
                "duplicate headers in metadata file",
                SubmitFiles.revisedMetadataFileWith(
                    content = """
                            accession	submissionId	firstColumn
                            1	sameHeader	someValue
                            2	sameHeader	someValue2
                    """.trimIndent(),
                ),
                SubmitFiles.sequenceFileWith(),
                status().isUnprocessableEntity,
                "Unprocessable Entity",
                "Metadata file contains at least one duplicate submissionId",
            ),
            Arguments.of(
                "duplicate headers in sequence file",
                SubmitFiles.revisedMetadataFileWith(),
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
                            accession	submissionId	firstColumn
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
                "Sequence file contains 1 submissionIds that are not present in the metadata file: notInMetadata",
            ),
            Arguments.of(
                "sequence file misses submissionIds",
                SubmitFiles.metadataFileWith(
                    content = """
                            accession	submissionId	firstColumn
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
                "Metadata file contains 1 submissionIds that are not present in the sequence file: notInSequences",
            ),
            Arguments.of(
                "metadata file misses accession header",
                SubmitFiles.metadataFileWith(
                    content = """
                            submissionId	firstColumn
                            someHeader	someValue
                            someHeader2	someValue
                    """.trimIndent(),
                ),
                SubmitFiles.sequenceFileWith(),
                status().isUnprocessableEntity,
                "Unprocessable Entity",
                "The revised metadata file does not contain the header 'accession'",
            ),
            Arguments.of(
                "metadata file with one row with missing accession",
                SubmitFiles.metadataFileWith(
                    content = """
                            accession	submissionId	firstColumn
                            	someHeader	someValue
                            2	someHeader2	someValue
                    """.trimIndent(),
                ),
                SubmitFiles.sequenceFileWith(),
                status().isUnprocessableEntity,
                "Unprocessable Entity",
                "A row in metadata file contains no accession",
            ),
        )
    }
}
