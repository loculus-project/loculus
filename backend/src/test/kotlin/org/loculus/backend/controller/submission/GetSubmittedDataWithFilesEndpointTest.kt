package org.loculus.backend.controller.submission

import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.hasKey
import org.hamcrest.Matchers.hasSize
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForDefaultUser
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.shaded.org.awaitility.Awaitility.await

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG"],
)
class GetSubmittedDataWithFilesEndpointTest(
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
) {
    private fun submitFilesAndApprove(): Int {
        val groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
        val accessions = convenienceClient.submitDefaultFiles(groupId = groupId, includeFileMapping = true)
            .submissionIdMappings
            .map { it.accession }

        val unprocessedData = convenienceClient.extractUnprocessedData()
        convenienceClient.submitProcessedData(
            unprocessedData.map { PreparedProcessedData.successfullyProcessed(accession = it.accession) },
        )
        convenienceClient.approveProcessedSequenceEntries(accessions.map { AccessionVersion(it, 1) })
        return groupId
    }

    @Test
    fun `GIVEN organism with files enabled THEN zip contains files TSV`() {
        val groupId = submitFilesAndApprove()

        val response = submissionControllerClient.getSubmittedData(groupId = groupId)
            .andExpect(status().isOk)
            .andReturn()
            .response

        await().until { response.isCommitted }

        val entries = extractSubmittedDataZipEntries(response.contentAsByteArray)
        assertThat(entries, hasKey("files.tsv"))

        val existingFilesTsv = entries["files.tsv"]!!
        val lines = existingFilesTsv.lines().filter { it.isNotBlank() }

        assertThat(lines[0], `is`("id\tcategory\tfileId\tfileName"))
        // One row per submitted file: each of the default submissions has a single file.
        assertThat(lines.drop(1), hasSize(SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES))

        val categories = lines.drop(1).map { it.split("\t")[1] }.toSet()
        assertThat(categories, `is`(setOf("myFileCategory")))

        val fileNames = lines.drop(1).map { it.split("\t")[3] }.toSet()
        assertThat(fileNames, `is`(setOf("hello.txt")))
    }

    @Test
    fun `GIVEN files TSV THEN its id column joins to the metadata TSV id column`() {
        val groupId = submitFilesAndApprove()

        val response = submissionControllerClient.getSubmittedData(groupId = groupId)
            .andExpect(status().isOk)
            .andReturn()
            .response

        await().until { response.isCommitted }

        val entries = extractSubmittedDataZipEntries(response.contentAsByteArray)
        val metadataIds = entries["metadata.tsv"]!!.lines()
            .filter { it.isNotBlank() }
            .drop(1)
            .map { it.split("\t")[0] }
            .toSet()
        val fileRowIds = entries["files.tsv"]!!.lines()
            .filter { it.isNotBlank() }
            .drop(1)
            .map { it.split("\t")[0] }

        assertThat(fileRowIds, containsInAnyOrder(*metadataIds.toTypedArray()))
        // Every file row references an id that exists in the metadata TSV.
        assertThat(metadataIds.containsAll(fileRowIds), `is`(true))
    }

    @Test
    fun `GIVEN no files were submitted THEN files TSV is header-only`() {
        val groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(groupId = groupId)

        val response = submissionControllerClient.getSubmittedData(groupId = groupId)
            .andExpect(status().isOk)
            .andReturn()
            .response

        await().until { response.isCommitted }

        val entries = extractSubmittedDataZipEntries(response.contentAsByteArray)
        assertThat(entries, hasKey("files.tsv"))

        val lines = entries["files.tsv"]!!.lines().filter { it.isNotBlank() }
        assertThat(lines, hasSize(1))
        assertThat(lines[0], `is`("id\tcategory\tfileId\tfileName"))
    }
}
