package org.loculus.backend.controller.files

import com.fasterxml.jackson.databind.ObjectMapper
import org.apache.http.client.methods.HttpPut
import org.apache.http.entity.ByteArrayEntity
import org.apache.http.entity.ContentType
import org.apache.http.impl.client.HttpClients
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Assertions
import org.junit.jupiter.api.Test
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForAlternativeUser
import org.loculus.backend.controller.jwtForProcessingPipeline
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG"],
)
class RequestUploadEndpointTest(
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
    fun `GIVEN a request for a URL THEN returns a valid presigned URL`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        val responseContent = client.requestUploads(groupId, 1)
            .andExpect(status().isOk)
            .andReturn()
            .response
            .contentAsString
        val url = objectMapper.readTree(responseContent)
            .get(0)
            .get("url")
            .textValue()

        val content = "test content".toByteArray()
        val request = HttpPut(url)
        request.entity = ByteArrayEntity(content, ContentType.TEXT_PLAIN)
        val httpClient = HttpClients.createDefault()
        val response = httpClient.execute(request)
        Assertions.assertEquals(200, response.statusLine.statusCode)
    }

    @Test
    fun `GIVEN a request with no groupId THEN returns bad request`() {
        client.requestUploads(groupId = null, numberFiles = 1)
            .andExpect(status().isBadRequest)
    }

    @Test
    fun `GIVEN a request with groupId of a non-existent group THEN returns not found`() {
        val nonExistentGroupId = -1
        client.requestUploads(groupId = nonExistentGroupId, numberFiles = 1)
            .andExpect(status().isNotFound)
        client.requestUploads(groupId = nonExistentGroupId, numberFiles = 1, jwt = jwtForProcessingPipeline)
            .andExpect(status().isNotFound)
    }

    @Test
    fun `GIVEN superuser request with non-existent group THEN returns not found`() {
        val nonExistentGroupId = -1

        client.requestUploads(
            groupId = nonExistentGroupId,
            numberFiles = 1,
            jwt = generateJwtFor("superuser", listOf("super_user")),
        )
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("\$.detail", containsString("do(es) not exist")))
    }

    @Test
    fun `GIVEN a request with groupId of a different group THEN returns forbidden`() {
        val groupId = groupManagementClient.createNewGroup(jwt = jwtForAlternativeUser).andGetGroupId()
        client.requestUploads(groupId = groupId, numberFiles = 1)
            .andExpect(status().isForbidden)
    }

    @Test
    fun `GIVEN a preprocessing pipeline request with groupId of a different group THEN returns ok`() {
        val groupId = groupManagementClient.createNewGroup(jwt = jwtForAlternativeUser).andGetGroupId()
        client.requestUploads(groupId = groupId, numberFiles = 1, jwtForProcessingPipeline)
            .andExpect(status().isOk)
    }

    @Test
    fun `GIVEN a prepro pipeline request with non-existent group THEN returns not found`() {
        val nonExistentGroupId = -1
        client.requestUploads(groupId = nonExistentGroupId, numberFiles = 1, jwt = jwtForProcessingPipeline)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("\$.detail", containsString("do(es) not exist")))
    }

    // This should actually be 401 but current behavior is buggy
    // see https://github.com/loculus-project/loculus/issues/4601
    @Test
    fun `GIVEN request without authentication THEN returns 403 forbidden`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()

        client.requestUploads(groupId = groupId, numberFiles = 1, jwt = "")
            .andExpect(status().isForbidden)
    }

    @Test
    fun `GIVEN request with invalid JWT token THEN returns 401 with WWW-Authenticate header`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()

        client.requestUploads(groupId = groupId, numberFiles = 1, jwt = "invalid-token")
            .andExpect(status().isUnauthorized)
            .andExpect(header().string("WWW-Authenticate", containsString("Bearer")))
    }

    @Test
    fun `GIVEN request with invalid numberFiles parameter THEN returns 400 bad request`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()

        client.requestUploads(groupId = groupId, numberFiles = 0)
            .andExpect(status().isBadRequest)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("\$.detail", containsString("Number of files must be at least 1")))
    }

    @Test
    fun `GIVEN request with negative numberFiles THEN returns 400 bad request`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()

        client.requestUploads(groupId = groupId, numberFiles = -5)
            .andExpect(status().isBadRequest)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("\$.detail", containsString("Number of files must be at least 1")))
    }

    @Test
    fun `GIVEN superuser request for any group THEN succeeds even if not member`() {
        val groupId = groupManagementClient.createNewGroup(jwt = jwtForAlternativeUser).andGetGroupId()

        client.requestUploads(
            groupId = groupId,
            numberFiles = 1,
            jwt = generateJwtFor("superuser", listOf("super_user")),
        )
            .andExpect(status().isOk)
    }

    @Test
    fun `GIVEN request with large positive number of files THEN succeeds`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()

        client.requestUploads(groupId = groupId, numberFiles = 100)
            .andExpect(status().isOk)
    }
}
