package org.loculus.backend.controller.files

import org.hamcrest.CoreMatchers.containsString
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG_WITH_MAX_FILE_SIZE
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForDefaultUser
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/** The config used here sets `fileSharing.maxFileSizeBytes` to 10 MB (10485760 bytes). */
@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG_WITH_MAX_FILE_SIZE"],
)
class RequestMultipartUploadMaxFileSizeEndpointTest(
    @Autowired private val groupManagementClient: GroupManagementControllerClient,
    @Autowired private val filesClient: FilesClient,
) {

    var groupId: Int = 0

    @BeforeEach
    fun prepareNewGroup() {
        groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
    }

    @Test
    fun `GIVEN partSizes summing to more than the configured max size THEN the request is rejected`() {
        // Two 6 MB parts (12 MB total) exceed the configured 10 MB limit.
        filesClient.requestMultipartUploads(groupId, partSizes = listOf(6L * 1024 * 1024, 6L * 1024 * 1024))
            .andExpect(status().isUnprocessableContent)
            .andExpect(content().string(containsString("exceeds the maximum allowed file size")))
    }

    @Test
    fun `GIVEN partSizes summing to exactly the configured max size THEN the request succeeds`() {
        filesClient.requestMultipartUploads(groupId, partSizes = listOf(10485760L))
            .andExpect(status().isOk)
    }
}
