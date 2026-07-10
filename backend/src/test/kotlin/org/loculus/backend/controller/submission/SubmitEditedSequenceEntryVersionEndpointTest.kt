package org.loculus.backend.controller.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.allOf
import org.hamcrest.Matchers.anEmptyMap
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.`is`
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.EditedSequenceEntryData
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.api.Status
import org.loculus.backend.api.SubmittedData
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_SIMPLE_FILE_CONTENT
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
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
import org.loculus.backend.controller.jwtForAlternativeUser
import org.loculus.backend.controller.jwtForSuperUser
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.util.UUID

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
    fun `GIVEN a sequence entry is processed WHEN I submit edited data THEN has changed unprocessed data`() {
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
            .andExpect(status().isUnprocessableEntity)
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
            .andExpect(status().isUnprocessableEntity)
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
            .andExpect(status().isUnprocessableEntity)
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

    @Test
    fun `WHEN submitting files with duplicate names THEN an error is returned`() {
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED).map { it.accession }

        val editedData = EditedSequenceEntryData(
            accession = accessions.first(),
            version = 1,
            data = SubmittedData(
                metadata = emptyMap(),
                unalignedNucleotideSequences = emptyMap(),
                files = mapOf(
                    "myFileCategory" to
                        listOf(
                            FileIdAndName(UUID.randomUUID(), "foo.txt"),
                            FileIdAndName(UUID.randomUUID(), "foo.txt"),
                        ),
                ),
            ),
        )

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath("\$.detail", containsString("duplicate file names")),
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
                unalignedNucleotideSequences = emptyMap(),
                files = mapOf(
                    "unknownCategory" to
                        listOf(
                            FileIdAndName(UUID.randomUUID(), "foo.txt"),
                        ),
                ),
            ),
        )

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("unknownCategory is not part of the configured submission categories"),
                ),
            )
    }

    @Test
    fun `WHEN submitting a non-existing file ID THEN an error is returned`() {
        val randomFileId = UUID.randomUUID()
        val accessions = convenienceClient.prepareDataTo(Status.PROCESSED).map { it.accession }

        val editedData = EditedSequenceEntryData(
            accession = accessions.first(),
            version = 1,
            data = SubmittedData(
                metadata = emptyMap(),
                unalignedNucleotideSequences = emptyMap(),
                files = mapOf(
                    "myFileCategory" to
                        listOf(
                            FileIdAndName(randomFileId, "foo.txt"),
                        ),
                ),
            ),
        )

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isUnprocessableEntity)
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
                unalignedNucleotideSequences = emptyMap(),
                files = mapOf(
                    "myFileCategory" to
                        listOf(
                            FileIdAndName(fileId, "foo.txt"),
                        ),
                ),
            ),
        )

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isUnprocessableEntity)
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
                unalignedNucleotideSequences = emptyMap(),
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
        val otherGroupId = groupManagementClient.createNewGroup(jwt = jwtForAlternativeUser).andGetGroupId()
        val otherGroupFileIdAndUrl = filesClient.requestUploads(
            groupId = otherGroupId,
            jwt = jwtForAlternativeUser,
        ).andGetFileIdsAndUrls()[0]
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
                unalignedNucleotideSequences = emptyMap(),
                files = mapOf("myFileCategory" to listOf(FileIdAndName(otherGroupFileIdAndUrl.fileId, "foo.txt"))),
            ),
        )

        client.submitEditedSequenceEntryVersion(editedData)
            .andExpect(status().isUnprocessableEntity)
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
        data = emptySubmittedData,
    )
}
