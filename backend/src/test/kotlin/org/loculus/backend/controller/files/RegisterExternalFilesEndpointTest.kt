package org.loculus.backend.controller.files

import com.fasterxml.jackson.module.kotlin.readValue
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.`is`
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.api.ExternalFile
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.api.FileIdAndNameAndReadUrl
import org.loculus.backend.api.ReleasedData
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.expectNdjsonAndGetContent
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jacksonObjectMapper
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.submission.PreparedProcessedData
import org.loculus.backend.controller.submission.SubmissionControllerClient
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.loculus.backend.controller.submission.withFileMapping
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.files.daysAgo
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

private const val ENA_PREFIX = "https://ftp.sra.ebi.ac.uk/vol1/fastq/"
private const val READ_1_URL = "${ENA_PREFIX}ERR100/093/ERR10093693/ERR10093693_1.fastq.gz"
private const val READ_2_URL = "${ENA_PREFIX}ERR100/093/ERR10093693/ERR10093693_2.fastq.gz"

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG"],
)
class RegisterExternalFilesEndpointTest(
    @Autowired private val filesClient: FilesClient,
    @Autowired private val groupManagementClient: GroupManagementControllerClient,
    @Autowired private val submissionControllerClient: SubmissionControllerClient,
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val filesDatabaseService: FilesDatabaseService,
) {
    private var groupId = 0

    @BeforeEach
    fun createGroup() {
        groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
    }

    @Test
    fun `GIVEN a URL registered before THEN the same file ID is returned`() {
        val first = filesClient.registerExternalFiles(groupId, listOf(ExternalFile(READ_1_URL)))
            .andGetFileIds()
        val second = filesClient.registerExternalFiles(
            groupId,
            listOf(ExternalFile(READ_2_URL), ExternalFile(READ_1_URL), ExternalFile(READ_1_URL)),
        ).andGetFileIds()

        assertThat(second[1], `is`(first[0]))
        assertThat(second[2], `is`(first[0]))
        assertThat(second[0], not(first[0]))
    }

    @Test
    fun `GIVEN a URL not matching an allowed prefix THEN the request is rejected`() {
        filesClient.registerExternalFiles(groupId, listOf(ExternalFile("https://example.com/reads.fastq.gz")))
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("\$.detail", containsString("is not allowed")))
    }

    @Test
    fun `GIVEN a URL escaping the allowed prefix via path traversal THEN the request is rejected`() {
        filesClient.registerExternalFiles(groupId, listOf(ExternalFile("$ENA_PREFIX../../reads.fastq.gz")))
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("\$.detail", containsString("is not allowed")))
    }

    @Test
    fun `GIVEN an unreferenced external file THEN it is never a garbage collection candidate`() {
        val fileId = filesClient.registerExternalFiles(groupId, listOf(ExternalFile(READ_1_URL))).andGetFileIds()[0]

        val candidates = filesDatabaseService.getDeletionCandidateFiles(daysAgo(-1)).map { it.id }

        assertThat(candidates.contains(fileId), `is`(false))
    }

    @Test
    fun `GIVEN a submission with external files THEN they are passed to preprocessing, released and redirected`() {
        val fileIds = filesClient.registerExternalFiles(
            groupId,
            listOf(ExternalFile(READ_1_URL, 2819215), ExternalFile(READ_2_URL)),
        ).andGetFileIds()
        val submissionId = DefaultFiles.submissionIds.first()
        val files = mapOf(
            "myFileCategory" to listOf(
                FileIdAndName(fileIds[0], "ERR10093693_1.fastq.gz"),
                FileIdAndName(fileIds[1], "ERR10093693_2.fastq.gz"),
            ),
        )
        submissionControllerClient.submit(
            DefaultFiles.metadataFile.withFileMapping(mapOf(submissionId to files)),
            DefaultFiles.sequencesFile,
            groupId = groupId,
        ).andExpect(status().isOk)

        val unprocessed = convenienceClient.extractUnprocessedData()
            .first { it.submissionId == submissionId }
        assertThat(
            unprocessed.data.files!!["myFileCategory"]!!.map { it.readUrl },
            `is`(listOf(READ_1_URL, READ_2_URL)),
        )

        convenienceClient.submitProcessedData(PreparedProcessedData.withFiles(unprocessed.accession, files))
        // Approval would fail if it tried to set S3 tags on the (non-existent) S3 objects
        convenienceClient.approveProcessedSequenceEntries(listOf(unprocessed))

        filesClient.getFile(unprocessed.accession, unprocessed.version, "myFileCategory", "ERR10093693_1.fastq.gz")
            .andExpect(status().isTemporaryRedirect)
            .andExpect(header().string("Location", READ_1_URL))
        filesClient.headFile(unprocessed.accession, unprocessed.version, "myFileCategory", "ERR10093693_2.fastq.gz")
            .andExpect(status().isTemporaryRedirect)
            .andExpect(header().string("Location", READ_2_URL))

        val released = submissionControllerClient.getReleasedData()
            .expectNdjsonAndGetContent<ReleasedData>()
            .first { it.metadata["accession"]!!.textValue() == unprocessed.accession }
        val releasedFiles = jacksonObjectMapper.readValue<List<FileIdAndNameAndReadUrl>>(
            released.metadata["myFileCategory"]!!.textValue(),
        )
        assertThat(releasedFiles.map { it.readUrl }, `is`(listOf(READ_1_URL, READ_2_URL)))
    }
}

@EndpointTest
class RegisterExternalFilesDisabledEndpointTest(
    @Autowired private val filesClient: FilesClient,
    @Autowired private val groupManagementClient: GroupManagementControllerClient,
) {
    @Test
    fun `GIVEN no allowed URL prefixes are configured THEN linking external files is rejected`() {
        val groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()

        filesClient.registerExternalFiles(groupId, listOf(ExternalFile(READ_1_URL)))
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("\$.detail", containsString("not enabled")))
    }
}
