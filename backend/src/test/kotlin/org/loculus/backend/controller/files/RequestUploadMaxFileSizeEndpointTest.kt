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
class RequestUploadMaxFileSizeEndpointTest(
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
    fun `GIVEN a contentLength exceeding the configured max size THEN the request is rejected`() {
        filesClient.requestUploads(groupId, contentLength = 10485760 + 1)
            .andExpect(status().isUnprocessableContent)
            .andExpect(content().string(containsString("exceeds the maximum allowed file size")))
    }

    @Test
    fun `GIVEN a contentLength within the configured max size THEN the request succeeds`() {
        filesClient.requestUploads(groupId, contentLength = 10485760)
            .andExpect(status().isOk)
    }
}
