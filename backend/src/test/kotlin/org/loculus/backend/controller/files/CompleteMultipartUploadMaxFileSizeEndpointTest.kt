package org.loculus.backend.controller.files

import org.hamcrest.CoreMatchers.containsString
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.api.FileIdAndEtags
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG_WITH_MAX_FILE_SIZE
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.service.files.S3Service
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/** The config used here sets `fileSharing.maxFileSizeBytes` to 10 MB (10485760 bytes). */
@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG_WITH_MAX_FILE_SIZE"],
)
class CompleteMultipartUploadMaxFileSizeEndpointTest(
    @Autowired private val groupManagementClient: GroupManagementControllerClient,
    @Autowired private val filesClient: FilesClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val s3Service: S3Service,
) {

    var groupId: Int = 0

    @BeforeEach
    fun prepareNewGroup() {
        groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
    }

    @Test
    fun `GIVEN a file exceeding the configured max size THEN the request fails and the file is deleted from S3`() {
        val fileIdAndUrls = filesClient.requestMultipartUploads(groupId, numberParts = 2)
            .andGetFileIdsAndMultipartUrls()[0]

        // Two 6 MB parts (12 MB total) exceed the configured 10 MB limit.
        val etag1 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[0], "A".repeat(6 * 1024 * 1024))
            .headers().map()["etag"]!![0]
        val etag2 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[1], "B".repeat(6 * 1024 * 1024))
            .headers().map()["etag"]!![0]

        filesClient.completeMultipartUploads(listOf(FileIdAndEtags(fileIdAndUrls.fileId, listOf(etag1, etag2))))
            .andExpect(status().isUnprocessableContent)
            .andExpect(content().string(containsString("exceed the maximum allowed file size")))

        assertNull(s3Service.getFileSize(fileIdAndUrls.fileId))
    }

    @Test
    fun `GIVEN a file within the configured max size THEN the request succeeds`() {
        val fileIdAndUrls = filesClient.requestMultipartUploads(groupId, numberParts = 2)
            .andGetFileIdsAndMultipartUrls()[0]

        val etag1 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[0], "A".repeat(5 * 1024 * 1024))
            .headers().map()["etag"]!![0]
        val etag2 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[1], "B".repeat(7))
            .headers().map()["etag"]!![0]

        filesClient.completeMultipartUploads(listOf(FileIdAndEtags(fileIdAndUrls.fileId, listOf(etag1, etag2))))
            .andExpect(status().isOk)
    }
}
