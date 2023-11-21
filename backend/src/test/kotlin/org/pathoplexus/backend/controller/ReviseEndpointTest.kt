package org.pathoplexus.backend.controller

import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.CoreMatchers.hasItem
import org.hamcrest.MatcherAssert
import org.hamcrest.Matchers
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.pathoplexus.backend.api.Status.APPROVED_FOR_RELEASE
import org.pathoplexus.backend.api.Status.HAS_ERRORS
import org.pathoplexus.backend.api.Status.RECEIVED
import org.pathoplexus.backend.api.UnprocessedData
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
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
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            client.reviseSequenceEntries(
                DefaultFiles.revisedMetadataFile,
                DefaultFiles.sequencesFile,
                jwt = it,
            )
        }
    }

    @Test
    fun `GIVEN entries with status 'APPROVED_FOR_RELEASE' THEN there is a revised version and returns HeaderIds`() {
        convenienceClient.prepareDataTo(APPROVED_FOR_RELEASE)

        client.reviseSequenceEntries(
            DefaultFiles.revisedMetadataFile,
            DefaultFiles.sequencesFile,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(DefaultFiles.NUMBER_OF_SEQUENCES))
            .andExpect(jsonPath("\$[0].submissionId").value("custom0"))
            .andExpect(jsonPath("\$[0].accession").value(DefaultFiles.firstAccession))
            .andExpect(jsonPath("\$[0].version").value(2))

        convenienceClient.getSequenceEntryOfUser(accession = DefaultFiles.firstAccession, version = 2)
            .assertStatusIs(RECEIVED)
        convenienceClient.getSequenceEntryOfUser(accession = DefaultFiles.firstAccession, version = 1)
            .assertStatusIs(APPROVED_FOR_RELEASE)

        val result = client.extractUnprocessedData(DefaultFiles.NUMBER_OF_SEQUENCES)
        val responseBody = result.expectNdjsonAndGetContent<UnprocessedData>()
        MatcherAssert.assertThat(responseBody, Matchers.hasSize(10))

        MatcherAssert.assertThat(
            responseBody,
            hasItem(
                UnprocessedData(
                    accession = DefaultFiles.firstAccession,
                    version = 2,
                    data = defaultOriginalData,
                ),
            ),
        )
    }

    @Test
    fun `WHEN submitting revised data with non-existing accessions THEN throws an unprocessableEntity error`() {
        convenienceClient.prepareDataTo(APPROVED_FOR_RELEASE)

        client.reviseSequenceEntries(
            SubmitFiles.revisedMetadataFileWith(
                content =
                """
                 accession	submissionId	firstColumn
                    123	someHeader	someValue
                    1	someHeader2	someOtherValue
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
        convenienceClient.prepareDataTo(APPROVED_FOR_RELEASE, organism = DEFAULT_ORGANISM)

        client.reviseSequenceEntries(
            DefaultFiles.revisedMetadataFile,
            DefaultFiles.sequencesFile,
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
        convenienceClient.prepareDataTo(APPROVED_FOR_RELEASE)

        val notSubmitter = "notTheSubmitter"
        client.reviseSequenceEntries(
            DefaultFiles.revisedMetadataFile,
            DefaultFiles.sequencesFile,
            jwt = generateJwtForUser(notSubmitter),
        )
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User '$notSubmitter' does not have right to change the accession versions " +
                        "1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1, 9.1, 10.1",
                ),
            )
    }

    @Test
    fun `WHEN submitting data with version not 'APPROVED_FOR_RELEASE' THEN throws an unprocessableEntity error`() {
        convenienceClient.prepareDataTo(HAS_ERRORS)

        client.reviseSequenceEntries(
            DefaultFiles.revisedMetadataFile,
            DefaultFiles.sequencesFile,
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession versions are in not in one of the states [APPROVED_FOR_RELEASE]: " +
                        "1.1 - HAS_ERRORS, 2.1 - HAS_ERRORS, 3.1 - HAS_ERRORS, 4.1 - HAS_ERRORS, " +
                        "5.1 - HAS_ERRORS, 6.1 - HAS_ERRORS, 7.1 - HAS_ERRORS, 8.1 - HAS_ERRORS, " +
                        "9.1 - HAS_ERRORS, 10.1 - HAS_ERRORS",
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
            .andExpect(jsonPath("\$.detail", Matchers.containsString(expectedMessage)))
    }

    companion object {
        @JvmStatic
        fun badRequestForRevision(): List<Arguments> {
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
                    "The metadata file does not contain the header 'submissionId'",
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
                    "Metadata file contains duplicate submissionIds",
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
                    "Sequence file contains duplicate submissionIds",
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
                            >commonHeader_main
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
                    "Metadata file misses header accession",
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
                    "A row with header 'someHeader' in metadata file contains no accession",
                ),

                Arguments.of(
                    "metadata file with one row with accession which is not a number",
                    SubmitFiles.metadataFileWith(
                        content = """
                            accession	submissionId	firstColumn
                            abc	someHeader	someValue
                            2	someHeader2	someValue
                        """.trimIndent(),
                    ),
                    SubmitFiles.sequenceFileWith(),
                    status().isUnprocessableEntity,
                    "Unprocessable Entity",
                    "A row with header 'someHeader' in metadata file contains no valid accession: abc",
                ),
            )
        }
    }
}
