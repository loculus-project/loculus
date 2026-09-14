package org.loculus.backend.controller.files

import com.fasterxml.jackson.databind.ObjectMapper
import org.apache.http.client.methods.HttpPut
import org.apache.http.entity.ByteArrayEntity
import org.apache.http.entity.ContentType
import org.apache.http.impl.client.HttpClients
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForAlternativeUser
import org.loculus.backend.controller.jwtForProcessingPipeline
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG"],
)
class RequestMultipartUploadEndpointTest(
    @Autowired private val client: FilesClient,
    @Autowired private val groupManagementClient: GroupManagementControllerClient,
    @Autowired private val objectMapper: ObjectMapper,
) {

    @Test
    fun `GIVEN a request for 2 URLs and 3 parts THEN returns a response with 2x3 URLs`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        val responseContent = client.requestMultipartUploads(groupId, 2, listOf(1000L, 1000L, 1000L))
            .andExpect(status().isOk)
            .andReturn()
            .response
            .contentAsString
        val responseJson = objectMapper.readTree(responseContent)
        assertThat(responseJson.size(), `is`(2))
        responseJson.forEach {
            assert(it.has("fileId"))
            val urls = it["urls"]
            assert(urls.isArray)
            assert(urls.size() == 3)
        }
    }

    @Test
    fun `GIVEN a request with no partSizes THEN returns bad request`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        client.requestMultipartUploads(groupId, null, partSizes = null)
            .andExpect(status().isBadRequest)
    }

    @Test
    fun `GIVEN a request for 3 parts THEN returns valid presigned URLs`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()

        val partSize = 5 * 1024 * 1024
        val responseJson = client.requestMultipartUploads(groupId, 1, List(3) { partSize.toLong() })
            .andExpect(status().isOk)
            .andReturn()
            .response
            .contentAsString
            .let { objectMapper.readTree(it) }

        assert(responseJson.size() == 1)
        val urls = responseJson[0].get("urls")
        assert(urls.size() == 3)

        val partContent = ByteArray(partSize)
        val httpClient = HttpClients.createDefault()

        urls.forEach { urlNode ->
            val put = HttpPut(urlNode.textValue()).apply {
                entity = ByteArrayEntity(partContent, ContentType.APPLICATION_OCTET_STREAM)
            }
            val response = httpClient.execute(put)
            assert(response.statusLine.statusCode == 200)
            val etag = response.getFirstHeader("etag")?.value
            assert(etag != null && etag.isNotBlank())
        }
    }

    @Test
    fun `GIVEN a part upload whose body size differs from the declared partSize THEN the upload is rejected`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()

        val responseJson = client.requestMultipartUploads(groupId, 1, listOf(12L))
            .andExpect(status().isOk)
            .andReturn()
            .response
            .contentAsString
            .let { objectMapper.readTree(it) }
        val url = responseJson[0].get("urls")[0].textValue()

        // The presigned URL is locked to accept exactly 12 bytes, but this body is longer.
        val put = HttpPut(url).apply {
            entity = ByteArrayEntity("this content is too long".toByteArray(), ContentType.TEXT_PLAIN)
        }
        val response = HttpClients.createDefault().execute(put)
        assert(response.statusLine.statusCode != 200)
    }

    @Test
    fun `GIVEN a request with empty or 10001 partSizes THEN returns bad request`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        client.requestMultipartUploads(groupId, 1, emptyList())
            .andExpect(status().isBadRequest)
        client.requestMultipartUploads(groupId, 1, List(10001) { 1L })
            .andExpect(status().isBadRequest)
    }

    @Test
    fun `GIVEN a request with a negative partSize THEN returns bad request`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        client.requestMultipartUploads(groupId, 1, listOf(-1L))
            .andExpect(status().isBadRequest)
            .andExpect(content().string(containsString("must not contain negative values")))
    }

    @Test
    fun `GIVEN a request with no groupId THEN returns bad request`() {
        client.requestMultipartUploads(groupId = null, numberFiles = 1, partSizes = listOf(1L, 1L, 1L))
            .andExpect(status().isBadRequest)
    }

    @Test
    fun `GIVEN a request with groupId of a non-existent group THEN returns not found`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId() + 100
        client.requestMultipartUploads(groupId = groupId, numberFiles = 1, partSizes = listOf(1L))
            .andExpect(status().isNotFound)
        client.requestMultipartUploads(
            groupId = groupId,
            numberFiles = 1,
            partSizes = listOf(1L),
            jwt = jwtForProcessingPipeline,
        )
            .andExpect(status().isNotFound)
    }

    @Test
    fun `GIVEN a request with groupId of a different group THEN returns forbidden`() {
        val groupId = groupManagementClient.createNewGroup(jwt = jwtForAlternativeUser).andGetGroupId()
        client.requestMultipartUploads(groupId = groupId, numberFiles = 1, partSizes = listOf(1L))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `GIVEN a preprocessing pipeline request with groupId of a different group THEN returns ok`() {
        val groupId = groupManagementClient.createNewGroup(jwt = jwtForAlternativeUser).andGetGroupId()
        client.requestMultipartUploads(
            groupId = groupId,
            numberFiles = 1,
            partSizes = listOf(1L),
            jwt = jwtForProcessingPipeline,
        )
            .andExpect(status().isOk)
    }
}
