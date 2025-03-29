package org.loculus.backend.controller.files

import com.fasterxml.jackson.databind.ObjectMapper
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.junit.jupiter.api.Test
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG"],
)
class RequestUploadsEndpointTest(
    @Autowired private val client: FilesClient,
    @Autowired private val groupManagementClient: GroupManagementControllerClient,
    @Autowired private val objectMapper: ObjectMapper,
) {

    @Test
    fun `GIVEN a request for three URLs THEN returns a response with three URLs`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        val responseContent = client.requestUploads(groupId, 3)
            .andExpect(status().isOk)
            .andReturn()
            .response
            .contentAsString
        val responseJson = objectMapper.readTree(responseContent)
        assertThat(responseJson.size(), `is`(3))
        responseJson.forEach {
            assert(it.has("fileId"))
            assert(it.has("url"))
        }
    }

    @Test
    fun `GIVEN a request with no numberFiles THEN returns a response with one URL`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        val responseContent = client.requestUploads(groupId, null)
            .andExpect(status().isOk)
            .andReturn()
            .response
            .contentAsString
        val responseJson = objectMapper.readTree(responseContent)
        assertThat(responseJson.size(), `is`(1))
        responseJson.forEach {
            assert(it.has("fileId"))
            assert(it.has("url"))
        }
    }

    @Test
    fun `GIVEN a request with no groupId THEN returns bad request`() {
        client.requestUploads(groupId = null, numberFiles = 1)
            .andExpect(status().isBadRequest)
    }

    @Test
    fun `GIVEN a request with groupId of a different or non-existent group THEN fails`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId() + 1
        client.requestUploads(groupId = groupId, numberFiles = 1)
            .andExpect(status().is4xxClientError)
    }

}
