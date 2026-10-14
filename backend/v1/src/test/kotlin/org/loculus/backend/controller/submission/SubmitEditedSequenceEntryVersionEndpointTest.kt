package org.loculus.backend.controller.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.allOf
import org.hamcrest.Matchers.anEmptyMap
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.`is`
import org.hamcrest.Matchers.not
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.select
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.EditedSequenceEntryData
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.api.Status
import org.loculus.backend.api.SubmittedData
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_SIMPLE_FILE_CONTENT
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.ORGANISM_WITHOUT_CONSENSUS_SEQUENCES
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.assertHasError
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.files.FilesClient
import org.loculus.backend.controller.files.andGetFileIds
import org.loculus.backend.controller.files.andGetFileIdsAndUrls
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForSuperUser
import org.loculus.backend.service.files.dummyFileId
import org.loculus.backend.service.submission.SequenceEntriesTable
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG"],
)
class SubmitEditedSequenceEntryVersionEndpointTest(
    @Autowired val client: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
    @Autowired val filesClient: FilesClient,
) {

    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            client.submitEditedSequenceEntryVersion(
                generateEditedData("1"),
                jwt = it,
            )
        }
    }

    @Test
    fun `GIVEN a sequence entry has errors WHEN I submit edited data THEN the status changes to RECEIVED`() {
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED, errors = true).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
            .assertHasError(true)

        val editedData = generateEditedData(accessions.first())
        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.RECEIVED)
    }

    @Test
    fun `GIVEN a sequence entry is processed WHEN I submit edited data THEN the status changes to RECEIVED`() {
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)

        val editedData = generateEditedData(accessions.first())

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.RECEIVED)
    }

    @Test
    fun `GIVEN a sequence entry is processed WHEN I submit edited data THEN submitted and archived data are updated`() {
        val firstAccession = convenienceClient.prepareDataTo(Status.PROCESSED)
            .map { it.accession }
            .first()

        val entryBeforeEdit = convenienceClient.getSubmittedMetadata()
            .find { it.accession == firstAccession && it.version == 1L }!!
        assertThat(entryBeforeEdit.submittedMetadata, `is`(not(anEmptyMap())))

        val editedData = generateEditedData(firstAccession)

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isNoContent)

        val entryAfterEdit = convenienceClient.getSubmittedMetadata()
            .find { it.accession == firstAccession && it.version == 1L }!!
        assertThat(entryAfterEdit.submittedMetadata, `is`(anEmptyMap()))

        // No endpoint returns the archived data, so need to query the DB directly
        transaction {
            val row = SequenceEntriesTable
                .select(SequenceEntriesTable.submittedDataColumn, SequenceEntriesTable.archiveOfSubmittedDataColumn)
                .where {
                    (SequenceEntriesTable.accessionColumn eq firstAccession) and
                        (SequenceEntriesTable.versionColumn eq 1L)
                }
                .single()
            assertThat(
                row[SequenceEntriesTable.archiveOfSubmittedDataColumn],
                `is`(row[SequenceEntriesTable.submittedDataColumn]),
            )
        }
    }

    @Test
    fun `WHEN a version does not exist THEN it returns an unprocessable entity error`() {
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED, errors = true).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
            .assertHasError(true)

        val editedDataWithNonExistingVersion = generateEditedData(accessions.first(), version = 2)
        val sequenceString = editedDataWithNonExistingVersion.displayAccessionVersion()

        client.submitEditedSequenceEntryVersion(editedDataWithNonExistingVersion)
            .andExpect(status().isUnprocessableContent)
            .andExpect(
                jsonPath("\$.detail")
                    .value("Accession versions $sequenceString do not exist"),
            )
    }

    @Test
    fun `WHEN an accession does not exist THEN it returns an unprocessable entity error`() {
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED, errors = true).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
            .assertHasError(true)

        val nonExistingAccession = "nonExistingAccession"

        val editedDataWithNonExistingAccession = generateEditedData(nonExistingAccession)

        client.submitEditedSequenceEntryVersion(editedDataWithNonExistingAccession)
            .andExpect(status().isUnprocessableContent)
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession versions $nonExistingAccession.1 do not exist",
                ),
            )

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
            .assertHasError(true)
    }

    @Test
    fun `WHEN submitting data for wrong organism THEN it returns an unprocessable entity error`() {
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED, errors = true).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
            .assertHasError(true)

        val editedData = generateEditedData(accessions.first())

        client.submitEditedSequenceEntryVersion(editedData, organism = OTHER_ORGANISM)
            .andExpect(status().isUnprocessableContent)
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("The following accession versions are not of organism"),
                ),
            )

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
            .assertHasError(true)
    }

    @Test
    fun `WHEN a sequence entry does not belong to a user THEN it returns an forbidden error`() {
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED, errors = true).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
            .assertHasError(true)

        val editedDataFromWrongSubmitter = generateEditedData(accessions.first())
        val nonExistingUser = "whoseNameMayNotBeMentioned"

        client.submitEditedSequenceEntryVersion(editedDataFromWrongSubmitter, jwt = generateJwtFor(nonExistingUser))
            .andExpect(status().isForbidden)
            .andExpect(
                jsonPath("\$.detail", containsString("is not a member of group")),
            )

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
            .assertHasError(true)
    }

    @Test
    fun `WHEN superuser submits edited data for entry of other group THEN accepts data`() {
        val accessionVersion = convenienceClient
            .prepareDataTo(Status.PROCESSED, errors = true, username = DEFAULT_USER_NAME)
            .first()

        val editedData = generateEditedData(accessionVersion.accession, accessionVersion.version)
        client.submitEditedSequenceEntryVersion(editedData, jwt = jwtForSuperUser)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessionVersion.accession, version = accessionVersion.version)
            .assertStatusIs(Status.RECEIVED)
    }

    companion object {
        @JvmStatic
        fun sequenceLessShapes(): List<Arguments> = listOf(
            Arguments.of("no fasta entries at all", emptyMap<String, String?>()),
            Arguments.of("a blank sequence", mapOf("main" to "")),
            Arguments.of("a null sequence", mapOf("main" to null)),
        )
    }

    @ParameterizedTest(name = "GIVEN organism requires consensus sequences WHEN editing with {0} THEN returns error")
    @MethodSource("sequenceLessShapes")
    fun `GIVEN organism requires consensus sequences WHEN editing with no sequence THEN returns error`(
        @Suppress("UNUSED_PARAMETER") description: String,
        unalignedNucleotideSequences: Map<String, String?>,
    ) {
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED).map { it.accession }

        val editedData = EditedSequenceEntryData(
            accession = accessions.first(),
            version = 1,
            data = emptySubmittedData.copy(unalignedNucleotideSequences = unalignedNucleotideSequences),
        )

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isUnprocessableContent)
            .andExpect(
                jsonPath("\$.detail", containsString("must contain at least one consensus sequence")),
            )

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.PROCESSED)
    }

    @Test
    fun `GIVEN multi-segmented organism WHEN editing with only one segment filled THEN succeeds`() {
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED, organism = OTHER_ORGANISM)
            .map { it.accession }

        val editedData = EditedSequenceEntryData(
            accession = accessions.first(),
            version = 1,
            data = emptySubmittedData.copy(unalignedNucleotideSequences = mapOf("notOnlySegment" to "ACTG")),
        )

        client.submitEditedSequenceEntryVersion(editedData, organism = OTHER_ORGANISM)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1, organism = OTHER_ORGANISM)
            .assertStatusIs(Status.RECEIVED)
    }

    @Test
    fun `GIVEN organism does not require consensus sequences WHEN editing with no sequence THEN succeeds`() {
        val accessions = convenienceClient.prepareDataTo(
            Status.PROCESSED,
            organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES,
        ).map { it.accession }

        val editedData = EditedSequenceEntryData(
            accession = accessions.first(),
            version = 1,
            data = emptySubmittedData,
        )

        client.submitEditedSequenceEntryVersion(editedData, organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(
            accession = accessions.first(),
            version = 1,
            organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES,
        )
            .assertStatusIs(Status.RECEIVED)
    }

    @Test
    fun `GIVEN organism does not require consensus sequences WHEN editing with a sequence THEN returns error`() {
        val accessions = convenienceClient.prepareDataTo(
            Status.PROCESSED,
            organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES,
        ).map { it.accession }

        val editedData = EditedSequenceEntryData(
            accession = accessions.first(),
            version = 1,
            data = emptySubmittedData.copy(unalignedNucleotideSequences = mapOf("main" to "ACTG")),
        )

        client.submitEditedSequenceEntryVersion(editedData, organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES)
            .andExpect(status().isUnprocessableContent)
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString(
                        "Sequence uploads are not allowed for organism $ORGANISM_WITHOUT_CONSENSUS_SEQUENCES.",
                    ),
                ),
            )

        convenienceClient.getSequenceEntry(
            accession = accessions.first(),
            version = 1,
            organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES,
        )
            .assertStatusIs(Status.PROCESSED)
    }

    @Test
    fun `WHEN submitting files with duplicate names THEN an error is returned`() {
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED).map { it.accession }

        val editedData = EditedSequenceEntryData(
            accession = accessions.first(),
            version = 1,
            data = SubmittedData(
                metadata = emptyMap(),
                unalignedNucleotideSequences = mapOf("main" to "ACTG"),
                files = mapOf(
                    "myFileCategory" to
                        listOf(
                            FileIdAndName(dummyFileId(), "foo.txt"),
                            FileIdAndName(dummyFileId(), "foo.txt"),
                        ),
                ),
            ),
        )

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isUnprocessableContent)
            .andExpect(
                jsonPath("\$.detail", containsString("duplicate file names")),
            )
    }

    @Test
    fun `WHEN submitting files with duplicate file IDs THEN an error is returned`() {
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED).map { it.accession }

        val reusedFileId = dummyFileId()
        val editedData = EditedSequenceEntryData(
            accession = accessions.first(),
            version = 1,
            data = SubmittedData(
                metadata = emptyMap(),
                unalignedNucleotideSequences = mapOf("main" to "ACTG"),
                files = mapOf(
                    "myFileCategory" to
                        listOf(
                            FileIdAndName(reusedFileId, "foo.txt"),
                            FileIdAndName(reusedFileId, "bar.txt"),
                        ),
                ),
            ),
        )

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isUnprocessableContent)
            .andExpect(
                jsonPath(
                    "\$.detail",
                    allOf(
                        containsString("reuse the same file ID more than once"),
                        containsString(reusedFileId.toString()),
                    ),
                ),
            )
    }

    @Test
    fun `WHEN submitting unknown file categories THEN an error is returned`() {
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED).map { it.accession }

        val editedData = EditedSequenceEntryData(
            accession = accessions.first(),
            version = 1,
            data = SubmittedData(
                metadata = emptyMap(),
                unalignedNucleotideSequences = mapOf("main" to "ACTG"),
                files = mapOf(
                    "unknownCategory" to
                        listOf(
                            FileIdAndName(dummyFileId(), "foo.txt"),
                        ),
                ),
            ),
        )

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isUnprocessableContent)
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("unknownCategory is not part of the configured submission categories"),
                ),
            )
    }

    @Test
    fun `WHEN submitting a non-existing file ID THEN an error is returned`() {
        val randomFileId = dummyFileId()
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED).map { it.accession }

        val editedData = EditedSequenceEntryData(
            accession = accessions.first(),
            version = 1,
            data = SubmittedData(
                metadata = emptyMap(),
                unalignedNucleotideSequences = mapOf("main" to "ACTG"),
                files = mapOf(
                    "myFileCategory" to
                        listOf(
                            FileIdAndName(randomFileId, "foo.txt"),
                        ),
                ),
            ),
        )

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isUnprocessableContent)
            .andExpect(
                jsonPath(
                    "\$.detail",
                    allOf(
                        containsString("not exist"),
                        containsString(randomFileId.toString()),
                    ),
                ),
            )
    }

    @Test
    fun `WHEN submitting a file ID with no file uploaded THEN an error is returned`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED, groupId = groupId).map { it.accession }
        val fileId = filesClient.requestUploads(groupId).andGetFileIds()[0]

        val editedData = EditedSequenceEntryData(
            accession = accessions.first(),
            version = 1,
            data = SubmittedData(
                metadata = emptyMap(),
                unalignedNucleotideSequences = mapOf("main" to "ACTG"),
                files = mapOf(
                    "myFileCategory" to
                        listOf(
                            FileIdAndName(fileId, "foo.txt"),
                        ),
                ),
            ),
        )

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isUnprocessableContent)
            .andExpect(
                jsonPath("\$.detail", containsString("No file uploaded for file ID")),
            )
    }

    @Test
    fun `WHEN submitting edited data with a file owned by the same group THEN it succeeds`() {
        // Submission and files owned by group
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        val accessionVersion = AccessionVersion(
            convenienceClient.prepareDataTo(Status.PROCESSED, groupId = groupId).first().accession,
            1,
        )
        val fileIdAndUrl = filesClient.requestUploads(groupId = groupId).andGetFileIdsAndUrls()[0]
        convenienceClient.uploadFile(fileIdAndUrl.presignedWriteUrl, DEFAULT_SIMPLE_FILE_CONTENT, fileIdAndUrl.headers)

        val editedData = EditedSequenceEntryData(
            accession = accessionVersion.accession,
            version = accessionVersion.version,
            data = SubmittedData(
                metadata = emptyMap(),
                unalignedNucleotideSequences = mapOf("main" to "ACTG"),
                files = mapOf("myFileCategory" to listOf(FileIdAndName(fileIdAndUrl.fileId, "foo.txt"))),
            ),
        )

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessionVersion.accession, version = accessionVersion.version)
            .assertStatusIs(Status.RECEIVED)
    }

    @Test
    fun `WHEN submitting a file ID owned by another group THEN an error is returned`() {
        // Submission owned by group
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        val accessionVersion = AccessionVersion(
            convenienceClient.prepareDataTo(Status.PROCESSED, groupId = groupId).first().accession,
            1,
        )

        // File owned by another group
        val otherGroupId = groupManagementClient.createNewGroup().andGetGroupId()
        val otherGroupFileIdAndUrl = filesClient.requestUploads(groupId = otherGroupId).andGetFileIdsAndUrls()[0]
        convenienceClient.uploadFile(
            otherGroupFileIdAndUrl.presignedWriteUrl,
            DEFAULT_SIMPLE_FILE_CONTENT,
            otherGroupFileIdAndUrl.headers,
        )

        val editedData = EditedSequenceEntryData(
            accession = accessionVersion.accession,
            version = accessionVersion.version,
            data = SubmittedData(
                metadata = emptyMap(),
                unalignedNucleotideSequences = mapOf("main" to "ACTG"),
                files = mapOf("myFileCategory" to listOf(FileIdAndName(otherGroupFileIdAndUrl.fileId, "foo.txt"))),
            ),
        )

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isUnprocessableContent)
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString(
                        "Accession version ${accessionVersion.displayAccessionVersion()} belongs to " +
                            "group $groupId but the attached file ${otherGroupFileIdAndUrl.fileId} belongs to the group $otherGroupId.",
                    ),
                ),
            )
    }

    private fun generateEditedData(accession: String, version: Long = 1) = EditedSequenceEntryData(
        accession = accession,
        version = version,
        data = emptySubmittedData.copy(unalignedNucleotideSequences = mapOf("main" to "ACTG")),
    )
}
