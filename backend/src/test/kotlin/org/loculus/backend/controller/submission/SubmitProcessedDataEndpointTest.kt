package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.BooleanNode
import com.fasterxml.jackson.databind.node.DoubleNode
import com.fasterxml.jackson.databind.node.IntNode
import com.fasterxml.jackson.databind.node.TextNode
import com.fasterxml.jackson.module.kotlin.readValue
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.hasEntry
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.FileIdAndEtags
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.api.Insertion
import org.loculus.backend.api.Organism
import org.loculus.backend.api.Status
import org.loculus.backend.api.SubmittedProcessedData
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.DEFAULT_MULTIPART_FILE_PARTS
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DEFAULT_SIMPLE_FILE_CONTENT
import org.loculus.backend.controller.DUMMY_ORGANISM_MAIN_SEQUENCE
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.assertHasError
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.expectForbiddenResponse
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.files.FilesClient
import org.loculus.backend.controller.files.andGetFileIds
import org.loculus.backend.controller.files.andGetFileIdsAndMultipartUrls
import org.loculus.backend.controller.files.andGetFileIdsAndUrls
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.service.submission.AminoAcidSymbols
import org.loculus.backend.service.submission.NucleotideSymbols
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.loculus.backend.service.submission.UseNewerProcessingPipelineVersionTask
import org.loculus.backend.utils.Accession
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.UUID

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG"],
)
class SubmitProcessedDataEndpointTest(
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
    @Autowired val useNewerProcessingPipelineVersionTask: UseNewerProcessingPipelineVersionTask,
    @Autowired val submissionDatabaseService: SubmissionDatabaseService,
    @Autowired val objectMapper: ObjectMapper,
) {

    @Autowired
    private lateinit var filesClient: FilesClient

    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            submissionControllerClient.submitProcessedData(
                PreparedProcessedData.successfullyProcessed("DoesNotMatter"),
                jwt = it,
            )
        }
    }

    @Test
    fun `GIVEN authorization token with wrong role THEN returns 403 Forbidden`() {
        expectForbiddenResponse {
            submissionControllerClient.submitProcessedData(
                PreparedProcessedData.successfullyProcessed("DoesNotMatter"),
                jwt = jwtForDefaultUser,
            )
        }
    }

    @Test
    fun `WHEN I submit successfully preprocessed data THEN the sequence entry is in status processed`() {
        val accessions = prepareExtractedSequencesInDatabase().map { it.accession }

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accessions.first()),
        )
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)

        val sequenceEntryToEdit = convenienceClient.getSequenceEntryToEdit(accession = accessions.first(), version = 1)
        assertThat(sequenceEntryToEdit.processedData.metadata, hasEntry("qc", DoubleNode(0.987654321)))
        assertThat(sequenceEntryToEdit.processedData.metadata, hasEntry("age", IntNode(42)))
        assertThat(sequenceEntryToEdit.processedData.metadata, hasEntry("region", TextNode("Europe")))
        assertThat(sequenceEntryToEdit.processedData.metadata, hasEntry("pangoLineage", TextNode("XBB.1.5")))
        assertThat(sequenceEntryToEdit.processedData.metadata, hasEntry("booleanColumn", BooleanNode.TRUE))
    }

    @Test
    fun `WHEN I submit data with null as sequences THEN the sequence entry is in status processed`() {
        val (accession, version) = prepareExtractedSequencesInDatabase().first()

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withNullForSequences(accession = accession, version = version),
        )
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accession, version = version)
            .assertStatusIs(Status.PROCESSED)
    }

    @Test
    fun `WHEN I submit data with lowercase sequences THEN the sequences are converted to uppercase`() {
        val (accession, version) = prepareExtractedSequencesInDatabase().first()

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withLowercaseSequences(accession = accession, version = version),
        )
            .andExpect(status().isNoContent)

        val processedData = convenienceClient.getSequenceEntryToEdit(accession = accession, version = version)
            .processedData

        assertThat(processedData.unalignedNucleotideSequences, hasEntry(MAIN_SEGMENT, "NACTG"))
        assertThat(
            processedData.alignedNucleotideSequences,
            hasEntry(MAIN_SEGMENT, DUMMY_ORGANISM_MAIN_SEQUENCE),
        )
        assertThat(processedData.alignedAminoAcidSequences, hasEntry(SOME_LONG_GENE, "ACDEFGHIKLMNPQRSTVWYBZX-*"))
        assertThat(processedData.nucleotideInsertions, hasEntry(MAIN_SEGMENT, listOf(Insertion(123, "ACTG"))))
        assertThat(processedData.aminoAcidInsertions, hasEntry(SOME_LONG_GENE, listOf(Insertion(123, "DEF"))))
    }

    @Test
    fun `WHEN I submit with all valid symbols THEN the sequence entry is in status processed`() {
        val accessions = prepareExtractedSequencesInDatabase().map { it.accession }

        val allNucleotideSymbols = NucleotideSymbols.entries.joinToString("") { it.symbol.toString() }
        val desiredLength = 49

        val nucleotideSequenceOfDesiredLength = if (allNucleotideSymbols.length >= desiredLength) {
            throw Error("The desired length must be bigger than the length of all nucleotide symbols")
        } else {
            allNucleotideSymbols.repeat((desiredLength / allNucleotideSymbols.length) + 1).take(desiredLength)
        }

        val allAminoAcidSymbols = AminoAcidSymbols.entries.joinToString("") { it.symbol.toString() }
        val defaultData = PreparedProcessedData.successfullyProcessed(accessions.first()).data

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accessions.first()).copy(
                data = defaultData.copy(
                    unalignedNucleotideSequences = mapOf(MAIN_SEGMENT to nucleotideSequenceOfDesiredLength),
                    alignedNucleotideSequences = mapOf(MAIN_SEGMENT to nucleotideSequenceOfDesiredLength),
                    alignedAminoAcidSequences =
                    defaultData.alignedAminoAcidSequences + (SOME_LONG_GENE to allAminoAcidSymbols),
                ),
            ),
        )
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1).assertStatusIs(
            Status.PROCESSED,
        )
    }

    @Test
    fun `WHEN I submit null for a non-required field THEN the sequence entry is in status processed`() {
        val accessions = prepareExtractedSequencesInDatabase().map { it.accession }

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withNullForFields(accession = accessions.first(), fields = listOf("dateSubmitted")),
        )
            .andExpect(status().isNoContent)

        prepareExtractedSequencesInDatabase()

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
    }

    @Test
    fun `WHEN I submit data with errors THEN the sequence entry is in status has errors`() {
        val accessions = prepareExtractedSequencesInDatabase().map { it.accession }

        submissionControllerClient.submitProcessedData(PreparedProcessedData.withErrors(accessions.first()))
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
            .assertHasError(true)
    }

    @Test
    fun `GIVEN I submitted invalid data and errors THEN the sequence entry is in status has errors`() {
        val accessions = convenienceClient.submitDefaultFiles().submissionIdMappings.map { it.accession }
        convenienceClient.extractUnprocessedData(1)
        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withWrongDateFormat(accessions.first()).copy(
                accession = accessions.first(),
                errors = PreparedProcessedData.withErrors(accessions.first()).errors,
            ),
        ).andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
            .assertHasError(true)
    }

    @Test
    fun `WHEN I submit data with warnings THEN the sequence entry is in status processed`() {
        val accessions = prepareExtractedSequencesInDatabase().map { it.accession }

        submissionControllerClient.submitProcessedData(PreparedProcessedData.withWarnings(accessions.first()))
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
    }

    @ParameterizedTest(name = "{arguments}")
    @MethodSource("provideInvalidDataScenarios")
    fun `GIVEN invalid processed data THEN refuses to update and an error will be thrown`(
        invalidDataScenario: InvalidDataScenario,
    ) {
        val accessions = prepareExtractedSequencesInDatabase().map { it.accession }

        submissionControllerClient.submitProcessedData(
            invalidDataScenario.processedDataThatNeedsAValidAccession.copy(accession = accessions.first()),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("\$.detail").value(invalidDataScenario.expectedErrorMessage))

        val sequenceStatus = convenienceClient.getSequenceEntry(
            accession = accessions.first(),
            version = 1,
        )
        assertThat(sequenceStatus.status, `is`(Status.IN_PROCESSING))
    }

    @Test
    fun `WHEN I submit data for a non-existent accession THEN refuses update with unprocessable entity`() {
        val accessions = prepareExtractedSequencesInDatabase().map { it.accession }

        val nonExistentAccession = "999"

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accessions.first()),
            PreparedProcessedData.successfullyProcessed(accession = nonExistentAccession),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath("\$.detail")
                    .value(
                        "Accession version $nonExistentAccession.1 does not exist or is not awaiting " +
                            "any processing results",
                    ),
            )

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1).assertStatusIs(
            Status.IN_PROCESSING,
        )
    }

    @Test
    fun `WHEN I submit data for a non-existent accession version THEN refuses update with unprocessable entity`() {
        val accessions = prepareExtractedSequencesInDatabase().map { it.accession }

        val nonExistentVersion = 999L

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accessions.first()),
            PreparedProcessedData.successfullyProcessed(accession = accessions.first())
                .copy(version = nonExistentVersion),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession version ${accessions.first()}.$nonExistentVersion does not exist " +
                        "or is not awaiting any processing results",
                ),
            )

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.IN_PROCESSING)
    }

    @Test
    fun `WHEN I submit data for an entry that is not in processing THEN refuses update with unprocessable entity`() {
        val accessionsNotInProcessing = convenienceClient.prepareDataTo(Status.PROCESSED).map { it.accession }
        val accessionsInProcessing = convenienceClient.prepareDataTo(Status.IN_PROCESSING).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessionsNotInProcessing.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accessionsInProcessing.first()),
            PreparedProcessedData.successfullyProcessed(accession = accessionsNotInProcessing.first()),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession version ${accessionsNotInProcessing.first()}.1 " +
                        "does not exist or is not awaiting any processing results",
                ),
            )

        convenienceClient.getSequenceEntry(accession = accessionsInProcessing.first(), version = 1)
            .assertStatusIs(Status.IN_PROCESSING)
        convenienceClient.getSequenceEntry(accession = accessionsNotInProcessing.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
    }

    @Test
    fun `WHEN I submit a JSON entry with a missing field THEN returns bad request`() {
        val accession = prepareUnprocessedSequenceEntry()

        submissionControllerClient.submitProcessedDataRaw(
            """
                {
                    "accession": "$accession",
                    "version": 1,
                    "data": {
                        "noMetadata": null,
                        "unalignedNucleotideSequences": {
                            "main": "NNNNNN"
                        }
                    }
                }
            """.replace(Regex("\\s"), ""),
        )
            .andExpect(status().isBadRequest)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("\$.detail").value(containsString("Failed to deserialize NDJSON")))
            .andExpect(jsonPath("\$.detail").value(containsString("failed for JSON property metadata")))
    }

    @Test
    fun `WHEN I submit an entry with the wrong organism THEN refuses update with unprocessable entity`() {
        val accession = prepareUnprocessedSequenceEntry(OTHER_ORGANISM)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accession),
            organism = DEFAULT_ORGANISM,
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath("\$.detail")
                    .value(containsString("$accession.1 is for organism otherOrganism")),
            )
            .andExpect(
                jsonPath("\$.detail")
                    .value(containsString("submitted data is for organism dummyOrganism")),
            )
    }

    @Test
    fun `WHEN I submit an entry organism THEN requires the schema of the given organism`() {
        val defaultOrganismAccession = prepareUnprocessedSequenceEntry(DEFAULT_ORGANISM)
        val otherOrganismAccession = prepareUnprocessedSequenceEntry(OTHER_ORGANISM)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessedOtherOrganismData(accession = defaultOrganismAccession),
            organism = DEFAULT_ORGANISM,
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath("\$.detail").value("Unknown fields in metadata: specialOtherField."),
            )

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessedOtherOrganismData(accession = otherOrganismAccession),
            organism = OTHER_ORGANISM,
        )
            .andExpect(status().isNoContent)
    }

    @Test
    fun `WHEN I submit valid file THEN is successful`() {
        val groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
        val fileIdAndUrl = filesClient.requestUploads(
            groupId = groupId,
            jwt = jwtForDefaultUser,
        ).andGetFileIdsAndUrls()[0]
        convenienceClient.uploadFile(fileIdAndUrl.presignedWriteUrl, DEFAULT_SIMPLE_FILE_CONTENT)
        val accession = prepareUnprocessedSequenceEntry(DEFAULT_ORGANISM, groupId = groupId)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withFiles(
                accession,
                mapOf(
                    "myFileCategory" to listOf(
                        FileIdAndName(fileIdAndUrl.fileId, "foo.txt"),
                    ),
                    "myProcessedOnlyFileCategory" to listOf(
                        FileIdAndName(fileIdAndUrl.fileId, "foo.txt"),
                    ),
                ),
            ),
        )
            .andExpect(status().isNoContent)
    }

    @Test
    fun `WHEN I submit file of different group THEN fails`() {
        val groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
        val otherGroupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
        val fileId = filesClient.requestUploads(groupId = otherGroupId, jwt = jwtForDefaultUser).andGetFileIds()[0]
        val accession = prepareUnprocessedSequenceEntry(DEFAULT_ORGANISM, groupId = groupId)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withFiles(
                accession,
                mapOf(
                    "myFileCategory" to listOf(
                        FileIdAndName(fileId, "foo.txt"),
                    ),
                ),
            ),
        )
            .andExpect(status().isUnprocessableEntity)
    }

    @Test
    fun `WHEN I submit files to unknown categories THEN fails`() {
        val groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
        val fileId = filesClient.requestUploads(groupId = groupId, jwt = jwtForDefaultUser).andGetFileIds()[0]
        val accession = prepareUnprocessedSequenceEntry(DEFAULT_ORGANISM, groupId = groupId)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withFiles(
                accession,
                mapOf(
                    "unknownCategory" to listOf(
                        FileIdAndName(fileId, "foo.txt"),
                    ),
                ),
            ),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.detail", containsString("not part of the configured output categories")))
    }

    @Test
    fun `WHEN I submit files with duplicate file names THEN fails`() {
        val groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
        val fileId = filesClient.requestUploads(groupId = groupId, jwt = jwtForDefaultUser).andGetFileIds()[0]
        val accession = prepareUnprocessedSequenceEntry(DEFAULT_ORGANISM, groupId = groupId)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withFiles(
                accession,
                mapOf(
                    "myFileCategory" to listOf(
                        FileIdAndName(fileId, "foo.txt"),
                        FileIdAndName(fileId, "foo.txt"),
                    ),
                ),
            ),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.detail", containsString("duplicate file names")))
    }

    @Test
    fun `WHEN I submit non-existing file ID THEN fails`() {
        val groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
        val fileId = UUID.fromString("caaf8c66-e1ba-4c47-99b1-8c368adb9850")
        val accession = prepareUnprocessedSequenceEntry(DEFAULT_ORGANISM, groupId = groupId)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withFiles(
                accession,
                mapOf(
                    "myFileCategory" to listOf(
                        FileIdAndName(fileId, "foo.txt"),
                    ),
                ),
            ),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath(
                    "$.detail",
                    containsString("The File IDs [caaf8c66-e1ba-4c47-99b1-8c368adb9850] do not exist."),
                ),
            )
    }

    @Test
    fun `WHEN I submit non-existing file THEN fails`() {
        val groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
        val fileIdAndUrl = filesClient.requestUploads(
            groupId = groupId,
            jwt = jwtForDefaultUser,
        ).andGetFileIdsAndUrls()[0]
        val accession = prepareUnprocessedSequenceEntry(DEFAULT_ORGANISM, groupId = groupId)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withFiles(
                accession,
                mapOf(
                    "myFileCategory" to listOf(
                        FileIdAndName(fileIdAndUrl.fileId, "foo.txt"),
                    ),
                ),
            ),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath(
                    "$.detail",
                    containsString("No file uploaded for file ID ${fileIdAndUrl.fileId}."),
                ),
            )
    }

    @Test
    fun `WHEN the preprocessing pipeline submits files for already approved entries THEN new file is public`() {
        val groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()

        // Step 1: submit entry without files
        val accession = prepareUnprocessedSequenceEntry(DEFAULT_ORGANISM, groupId = groupId)

        // Step 2: extract and submit processed entry with files
        val fileIdAndUrlV1 = filesClient.requestUploads(
            groupId = groupId,
            jwt = jwtForDefaultUser,
        ).andGetFileIdsAndUrls()[0]
        convenienceClient.uploadFile(fileIdAndUrlV1.presignedWriteUrl, "FileV1")
        convenienceClient.extractUnprocessedData(pipelineVersion = 1)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withFiles(
                accession,
                mapOf("myFileCategory" to listOf(FileIdAndName(fileIdAndUrlV1.fileId, "v1.txt"))),
            ),
            pipelineVersion = 1,
        ).andExpect(status().isNoContent)

        // Step 3: approve entry
        convenienceClient.approveProcessedSequenceEntries(listOf(AccessionVersion(accession, 1)))

        // Step 4: extract and submit processed entry with higher pipeline version and new file
        val fileIdAndUrlV2 = filesClient.requestUploads(
            groupId = groupId,
            jwt = jwtForDefaultUser,
        ).andGetFileIdsAndUrls()[0]
        convenienceClient.uploadFile(fileIdAndUrlV2.presignedWriteUrl, "FileV2")
        convenienceClient.extractUnprocessedData(pipelineVersion = 2)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withFiles(
                accession,
                mapOf("myFileCategory" to listOf(FileIdAndName(fileIdAndUrlV2.fileId, "v2.txt"))),
            ),
            pipelineVersion = 2,
        ).andExpect(status().isNoContent)

        // Step 5: run task to update pipeline version
        useNewerProcessingPipelineVersionTask.task()
        assertThat(
            submissionDatabaseService.getCurrentProcessingPipelineVersion(Organism(DEFAULT_ORGANISM)),
            `is`(2L),
        )

        // Step 6: check file is publicly accessible
        val releasedData = convenienceClient.getReleasedData(organism = DEFAULT_ORGANISM)
        val filesJson = releasedData.first().metadata["myFileCategory"]!!.asText()
        val fileList: List<Map<String, String>> = objectMapper.readValue(filesJson)
        val fileUrl = fileList.first()["url"]!!
        val client = HttpClient.newHttpClient()
        val request = HttpRequest.newBuilder()
            .uri(URI.create(fileUrl))
            .build()
        val response = client.send(request, HttpResponse.BodyHandlers.ofString())
        assertThat(response.statusCode(), `is`(200))
        assertThat(response.body(), `is`("FileV2"))
    }

    @Test
    fun `WHEN the preprocessing pipeline is updated after V2 is submitted THEN new file is public`() {
        val groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()

        // Step 1: submit entry without files
        val accession = prepareUnprocessedSequenceEntry(DEFAULT_ORGANISM, groupId = groupId)

        // Step 2: extract and submit processed entry with files
        val fileIdAndUrlV1 = filesClient.requestUploads(
            groupId = groupId,
            jwt = jwtForDefaultUser,
        ).andGetFileIdsAndUrls()[0]
        convenienceClient.uploadFile(fileIdAndUrlV1.presignedWriteUrl, "FileV1")
        convenienceClient.extractUnprocessedData(pipelineVersion = 1)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withFiles(
                accession,
                mapOf("myFileCategory" to listOf(FileIdAndName(fileIdAndUrlV1.fileId, "v1.txt"))),
            ),
            pipelineVersion = 1,
        ).andExpect(status().isNoContent)

        // Step 3: extract and submit processed entry with higher pipeline version and new file
        val fileIdAndUrlV2 = filesClient.requestUploads(
            groupId = groupId,
            jwt = jwtForDefaultUser,
        ).andGetFileIdsAndUrls()[0]
        convenienceClient.uploadFile(fileIdAndUrlV2.presignedWriteUrl, "FileV2")
        convenienceClient.extractUnprocessedData(pipelineVersion = 2)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withFiles(
                accession,
                mapOf("myFileCategory" to listOf(FileIdAndName(fileIdAndUrlV2.fileId, "v2.txt"))),
            ),
            pipelineVersion = 2,
        ).andExpect(status().isNoContent)

        // Step 4: approve entry
        convenienceClient.approveProcessedSequenceEntries(listOf(AccessionVersion(accession, 1)))

        // Step 5: run task to update pipeline version
        useNewerProcessingPipelineVersionTask.task()
        assertThat(
            submissionDatabaseService.getCurrentProcessingPipelineVersion(Organism(DEFAULT_ORGANISM)),
            `is`(2L),
        )

        // Step 6: check file is publicly accessible
        val releasedData = convenienceClient.getReleasedData(organism = DEFAULT_ORGANISM)
        val filesJson = releasedData.first().metadata["myFileCategory"]!!.asText()
        val fileList: List<Map<String, String>> = objectMapper.readValue(filesJson)
        val fileUrl = fileList.first()["url"]!!
        val client = HttpClient.newHttpClient()
        val request = HttpRequest.newBuilder()
            .uri(URI.create(fileUrl))
            .build()
        val response = client.send(request, HttpResponse.BodyHandlers.ofString())
        assertThat(response.statusCode(), `is`(200))
        assertThat(response.body(), `is`("FileV2"))
    }

    @Test
    fun `WHEN I submit valid file with multipart upload THEN is successful`() {
        val groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
        val fileIdAndUrls = filesClient.requestMultipartUploads(
            groupId = groupId,
            jwt = jwtForDefaultUser,
            numberParts = 2,
        ).andGetFileIdsAndMultipartUrls()[0]
        val etag1 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[0], DEFAULT_MULTIPART_FILE_PARTS[0])
            .headers().map()["etag"]!![0]
        val etag2 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[1], DEFAULT_MULTIPART_FILE_PARTS[1])
            .headers().map()["etag"]!![0]
        filesClient.completeMultipartUploads(listOf(FileIdAndEtags(fileIdAndUrls.fileId, listOf(etag1, etag2))))

        val accession = prepareUnprocessedSequenceEntry(DEFAULT_ORGANISM, groupId = groupId)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withFiles(
                accession,
                mapOf(
                    "myFileCategory" to listOf(
                        FileIdAndName(fileIdAndUrls.fileId, "foo.txt"),
                    ),
                ),
            ),
        )
            .andExpect(status().isNoContent)
    }

    private fun prepareUnprocessedSequenceEntry(organism: String = DEFAULT_ORGANISM, groupId: Int? = null): Accession =
        prepareExtractedSequencesInDatabase(1, organism = organism, groupId = groupId)[0].accession

    private fun prepareExtractedSequencesInDatabase(
        numberOfSequenceEntries: Int = SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES,
        organism: String = DEFAULT_ORGANISM,
        groupId: Int? = null,
    ): List<UnprocessedData> {
        convenienceClient.submitDefaultFiles(organism = organism, groupId = groupId)
        return convenienceClient.extractUnprocessedData(numberOfSequenceEntries, organism = organism)
    }

    companion object {
        @JvmStatic
        fun provideInvalidDataScenarios() = provideInvalidMetadataScenarios() +
            provideInvalidNucleotideSequenceDataScenarios() +
            provideInvalidAminoAcidSequenceDataScenarios()

        @JvmStatic
        fun provideInvalidMetadataScenarios() = listOf(
            InvalidDataScenario(
                name = "data with unknown metadata fields",
                processedDataThatNeedsAValidAccession = PreparedProcessedData.withUnknownMetadataField(
                    accession = "DoesNotMatter",
                    fields = listOf(
                        "unknown field 1",
                        "unknown field 2",
                    ),
                ),
                expectedErrorMessage = "Unknown fields in metadata: unknown field 1, unknown field 2.",
            ),
            InvalidDataScenario(
                name = "data with missing required fields",
                processedDataThatNeedsAValidAccession = PreparedProcessedData.withMissingRequiredField(
                    accession = "DoesNotMatter",
                    fields = listOf("date", "region"),
                ),
                expectedErrorMessage = "Missing the required field 'date'.",
            ),
            InvalidDataScenario(
                name = "data with wrong type for fields",
                processedDataThatNeedsAValidAccession = PreparedProcessedData.withWrongTypeForFields(
                    accession = "DoesNotMatter",
                ),
                expectedErrorMessage = "Expected type 'string' for field 'region', found value '5'.",
            ),
            InvalidDataScenario(
                name = "data with wrong date format",
                processedDataThatNeedsAValidAccession = PreparedProcessedData.withWrongDateFormat(
                    accession = "DoesNotMatter",
                ),
                expectedErrorMessage =
                "Expected type 'date' in format 'yyyy-MM-dd' for field 'date', found value '\"1.2.2021\"'.",
            ),
            InvalidDataScenario(
                name = "data with wrong boolean format",
                processedDataThatNeedsAValidAccession = PreparedProcessedData.withWrongBooleanFormat(
                    accession = "DoesNotMatter",
                ),
                expectedErrorMessage =
                "Expected type 'boolean' for field 'booleanColumn', found value '\"not a boolean\"'.",
            ),
            InvalidDataScenario(
                name = "data with explicit null for required field",
                processedDataThatNeedsAValidAccession = PreparedProcessedData.withNullForFields(
                    accession = "DoesNotMatter",
                    fields = listOf("date"),
                ),
                expectedErrorMessage = "Field 'date' is null, but a value is required.",
            ),
        )

        @JvmStatic
        fun provideInvalidNucleotideSequenceDataScenarios() = listOf(
            InvalidDataScenario(
                name = "data with unknown segment in alignedNucleotideSequences",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withUnknownSegmentInAlignedNucleotideSequences(
                        accession = "DoesNotMatter",
                        segment = "someOtherSegment",
                    ),
                expectedErrorMessage = "Unknown segments in 'alignedNucleotideSequences': someOtherSegment.",
            ),
            InvalidDataScenario(
                name = "data with unknown segment in unalignedNucleotideSequences",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withUnknownSegmentInUnalignedNucleotideSequences(
                        accession = "DoesNotMatter",
                        segment = "someOtherSegment",
                    ),
                expectedErrorMessage = "Unknown segments in 'unalignedNucleotideSequences': someOtherSegment.",
            ),
            InvalidDataScenario(
                name = "data with unknown segment in nucleotideInsertions",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withUnknownSegmentInNucleotideInsertions(
                        accession = "DoesNotMatter",
                        segment = "someOtherSegment",
                    ),
                expectedErrorMessage = "Unknown segments in 'nucleotideInsertions': someOtherSegment.",
            ),
            InvalidDataScenario(
                name = "data with segment in aligned nucleotide sequences of wrong length",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withAlignedNucleotideSequenceOfWrongLength(
                        accession = "DoesNotMatter",
                        segment = "main",
                    ),
                expectedErrorMessage = "The length of 'main' in 'alignedNucleotideSequences' is 123, " +
                    "but it should be 49.",
            ),
            InvalidDataScenario(
                name = "data with segment in aligned nucleotide sequences with wrong symbols",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withAlignedNucleotideSequenceWithWrongSymbols(
                        accession = "DoesNotMatter",
                        segment = "main",
                    ),
                expectedErrorMessage = "The sequence of segment 'main' in 'alignedNucleotideSequences' " +
                    "contains invalid symbols: [Ä, Ö].",
            ),
            InvalidDataScenario(
                name = "data with segment in unaligned nucleotide sequences with wrong symbols",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withUnalignedNucleotideSequenceWithWrongSymbols(
                        accession = "DoesNotMatter",
                        segment = "main",
                    ),
                expectedErrorMessage = "The sequence of segment 'main' in 'unalignedNucleotideSequences' contains " +
                    "invalid symbols: [Ä, Ö, -].",
            ),
            InvalidDataScenario(
                name = "data with segment in nucleotide insertions with wrong symbols",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withNucleotideInsertionsWithWrongSymbols(
                        accession = "DoesNotMatter",
                        segment = "main",
                    ),
                expectedErrorMessage = "The insertion 123:ÄÖ of segment 'main' in 'nucleotideInsertions' contains " +
                    "invalid symbols: [Ä, Ö].",
            ),
        )

        @JvmStatic
        fun provideInvalidAminoAcidSequenceDataScenarios() = listOf(
            InvalidDataScenario(
                name = "data with unknown gene in alignedAminoAcidSequences",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withUnknownGeneInAlignedAminoAcidSequences(
                        accession = "DoesNotMatter",
                        gene = "someOtherGene",
                    ),
                expectedErrorMessage = "Unknown genes in 'alignedAminoAcidSequences': someOtherGene.",
            ),
            InvalidDataScenario(
                name = "data with unknown gene in aminoAcidInsertions",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withUnknownGeneInAminoAcidInsertions(
                        accession = "DoesNotMatter",
                        gene = "someOtherGene",
                    ),
                expectedErrorMessage = "Unknown genes in 'aminoAcidInsertions': someOtherGene.",
            ),
            InvalidDataScenario(
                name = "data with gene in alignedAminoAcidSequences of wrong length",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withAminoAcidSequenceOfWrongLength(
                        accession = "DoesNotMatter",
                        gene = SOME_SHORT_GENE,
                    ),
                expectedErrorMessage = "The length of 'someShortGene' in 'alignedAminoAcidSequences' is 123, " +
                    "but it should be 4.",
            ),
            InvalidDataScenario(
                name = "data with gene in alignedAminoAcidSequences with wrong symbols",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withAminoAcidSequenceWithWrongSymbols(
                        accession = "DoesNotMatter",
                        gene = SOME_SHORT_GENE,
                    ),
                expectedErrorMessage = "The gene 'someShortGene' in 'alignedAminoAcidSequences' contains " +
                    "invalid symbols: [Ä, Ö].",
            ),
            InvalidDataScenario(
                name = "data with segment in amino acid insertions with wrong symbols",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withAminoAcidInsertionsWithWrongSymbols(
                        accession = "DoesNotMatter",
                        gene = SOME_SHORT_GENE,
                    ),
                expectedErrorMessage = "An insertion of gene 'someShortGene' in 'aminoAcidInsertions' contains " +
                    "invalid symbols: [Ä, Ö].",
            ),
        )
    }
}

data class InvalidDataScenario(
    val name: String,
    val processedDataThatNeedsAValidAccession: SubmittedProcessedData,
    val expectedErrorMessage: String,
) {
    override fun toString(): String = "GIVEN $name THEN the response contains $expectedErrorMessage"
}
