package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.ObjectMapper
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.files.FilesClient
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType.APPLICATION_JSON_VALUE
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.util.UUID

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG"],
)
class SubmitEndpointFileSharingTest(
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val filesClient: FilesClient,
    @Autowired val objectMapper: ObjectMapper,
    @Autowired val backendConfig: BackendConfig,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
) {
    var groupId: Int = 0

    @BeforeEach
    fun prepareNewGroup() {
        groupId = groupManagementClient.createNewGroup().andGetGroupId()
    }

    @Test
    fun `config has been read and S3 is enabled`() {
        assertThat(backendConfig.s3.enabled, `is`(true))
    }

    @Test
    fun `GIVEN a valid request with a valid File ID THEN the request is valid`() {
        val responseString = filesClient.requestUploads(groupId).andReturn().response.contentAsString
        val responseJson = objectMapper.readTree(responseString)
        val fileId = UUID.fromString(responseJson[0]["fileId"].asText())

        submissionControllerClient.submit(
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFile,
            organism = DEFAULT_ORGANISM,
            groupId = groupId,
            fileMapping = mapOf("subId" to mapOf("fileField" to listOf(FileIdAndName(fileId, "foo.txt")))),
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(NUMBER_OF_SEQUENCES))
            .andExpect(jsonPath("\$[0].submissionId").value("custom0"))
            .andExpect(jsonPath("\$[0].accession", containsString(backendConfig.accessionPrefix)))
            .andExpect(jsonPath("\$[0].version").value(1))
    }

    @Test
    fun `GIVEN a non-existing file ID is given in submit THEN the request is not valid`() {
        val responseString = filesClient.requestUploads(groupId).andReturn().response.contentAsString
        val responseJson = objectMapper.readTree(responseString)
        val fileId = UUID.fromString(responseJson[0]["fileId"].asText())
        val randomId = UUID.randomUUID()

        submissionControllerClient.submit(
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFile,
            organism = DEFAULT_ORGANISM,
            groupId = groupId,
            fileMapping = mapOf(
                "subId" to
                    mapOf("fileField" to listOf(FileIdAndName(fileId, "foo.txt"), FileIdAndName(randomId, "bar.txt"))),
            ),
        )
            .andExpect(status().isBadRequest())
        // TODO maybe check for specific error response
    }
}
