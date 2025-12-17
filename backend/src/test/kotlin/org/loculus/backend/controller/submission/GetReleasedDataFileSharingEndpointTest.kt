package org.loculus.backend.controller.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.hasKey
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.api.ReleasedData
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.datauseterms.DataUseTermsControllerClient
import org.loculus.backend.controller.expectNdjsonAndGetContent
import org.loculus.backend.controller.files.FilesClient
import org.loculus.backend.controller.files.andGetFileIdsAndUrls
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jacksonObjectMapper
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.springframework.beans.factory.annotation.Autowired
import tools.jackson.databind.node.NullNode

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG"],
)
class GetReleasedDataFileSharingEndpointTest(
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val submissionControllerClient: SubmissionControllerClient,
    @Autowired private val groupClient: GroupManagementControllerClient,
    @Autowired private val dataUseTermsClient: DataUseTermsControllerClient,
    @Autowired private val submissionDatabaseService: SubmissionDatabaseService,
    @Autowired private val groupManagementClient: GroupManagementControllerClient,
    @Autowired private val filesClient: FilesClient,
) {
    private val objectMapper = jacksonObjectMapper

    @Test
    fun `GIVEN processed data with files THEN return file information in metadata`() {
        // Preparation
        val groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToInProcessing(groupId = groupId)
        val fileIdsAndUrls = filesClient.requestUploads(
            groupId = groupId,
            jwt = jwtForDefaultUser,
            numberFiles = 2,
        ).andGetFileIdsAndUrls()
        fileIdsAndUrls.forEach { convenienceClient.uploadFile(it.presignedWriteUrl, "File") }
        val fileIds = fileIdsAndUrls.map { it.fileId }

        convenienceClient.extractUnprocessedData(pipelineVersion = 1)
        val processedData = accessionVersions.map {
            val processed = PreparedProcessedData.successfullyProcessed(accession = it.accession, version = it.version)
            processed.copy(
                data = processed.data.copy(
                    files = mapOf(
                        "myFileCategory" to fileIds.mapIndexed { i, id -> FileIdAndName(id, "file$i.txt") },
                    ),
                ),
            )
        }
        convenienceClient.submitProcessedData(processedData)
        convenienceClient.approveProcessedSequenceEntries(accessionVersions)

        // Call get-released-data
        val response = submissionControllerClient.getReleasedData()
        val responseBody = response.expectNdjsonAndGetContent<ReleasedData>()
        assertThat(responseBody, hasSize(accessionVersions.size))
        for (entry in responseBody) {
            assertThat(entry.metadata, hasKey("myFileCategory"))
            val myFileCategory = objectMapper.readTree(entry.metadata["myFileCategory"]!!.asString()).toList()
            assertThat(myFileCategory, hasSize(2))
            fileIds.forEachIndexed { i, id ->
                val file = myFileCategory[i]
                assertThat(file["fileId"].asString(), `is`(fileIds[i].toString()))
                assertThat(file["name"].asString(), `is`("file$i.txt"))
                assertThat(file["url"].asString(), containsString(fileIds[i].toString()))
            }

            assertThat(entry.metadata, hasKey("myOtherFileCategory"))
            assertThat(entry.metadata["myOtherFileCategory"], `is`(NullNode.getInstance()))

            assertThat(entry.metadata, hasKey("myProcessedOnlyFileCategory"))
            assertThat(entry.metadata["myProcessedOnlyFileCategory"], `is`(NullNode.getInstance()))
        }
    }

    @Test
    fun `GIVEN revocation entry THEN return null in metadata`() {
        val accessionVersions = convenienceClient.prepareRevokedSequenceEntries()

        val response = submissionControllerClient.getReleasedData()
        val responseBody = response.expectNdjsonAndGetContent<ReleasedData>()
        val revocationEntries = responseBody.filter { it.metadata["isRevocation"]!!.asBoolean() }
        assertThat(revocationEntries, hasSize(accessionVersions.size))
        for (entry in revocationEntries) {
            listOf("myFileCategory", "myOtherFileCategory", "myProcessedOnlyFileCategory").forEach {
                assertThat(entry.metadata, hasKey(it))
                assertThat(entry.metadata[it], `is`(NullNode.getInstance()))
            }
        }
    }
}
