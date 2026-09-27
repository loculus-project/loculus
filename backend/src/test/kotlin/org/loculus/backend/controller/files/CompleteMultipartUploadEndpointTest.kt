package org.loculus.backend.controller.files

import org.hamcrest.CoreMatchers.containsString
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.api.FileIdAndEtags
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.DEFAULT_MULTIPART_FILE_PARTS
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG"],
)
class CompleteMultipartUploadEndpointTest(
    @Autowired private val groupManagementClient: GroupManagementControllerClient,
    @Autowired private val filesClient: FilesClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {

    var groupId: Int = 0

    @BeforeEach
    fun prepareNewGroup() {
        groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
    }

    @Test
    fun `GIVEN a request with 2 files with 2 valid etags each THEN the request succeeds`() {
        val fileIdAndUrls = filesClient.requestMultipartUploads(
            groupId = groupId,
            numberFiles = 2,
            numberParts = 2,
        ).andGetFileIdsAndMultipartUrls()
        val fileIdAndEtags = fileIdAndUrls.map { file ->
            val etag1 = convenienceClient.uploadFile(file.presignedWriteUrls[0], DEFAULT_MULTIPART_FILE_PARTS[0])
                .headers().map()["etag"]!![0]
            val etag2 = convenienceClient.uploadFile(file.presignedWriteUrls[1], DEFAULT_MULTIPART_FILE_PARTS[1])
                .headers().map()["etag"]!![0]
            FileIdAndEtags(file.fileId, listOf(etag1, etag2))
        }

        filesClient.completeMultipartUploads(fileIdAndEtags)
            .andExpect(status().isOk)
    }

    @Test
    fun `GIVEN missing etags THEN the request is not valid`() {
        val fileIdAndUrls = filesClient.requestMultipartUploads(groupId = groupId, numberParts = 2)
            .andGetFileIdsAndMultipartUrls()[0]

        filesClient.completeMultipartUploads(listOf(FileIdAndEtags(fileIdAndUrls.fileId, emptyList())))
            .andExpect(status().isUnprocessableContent)
            .andExpect(content().string(containsString("No etags provided")))
    }

    @Test
    fun `GIVEN a wrong etag THEN the request is not valid`() {
        val fileIdAndUrls = filesClient.requestMultipartUploads(groupId = groupId, numberParts = 2)
            .andGetFileIdsAndMultipartUrls()[0]
        val etag1 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[0], DEFAULT_MULTIPART_FILE_PARTS[0])
            .headers().map()["etag"]!![0]
        val etag2 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[1], DEFAULT_MULTIPART_FILE_PARTS[1])
            .headers().map()["etag"]!![0]
        val wrongEtag2 = (if (etag2[0] != 'a') 'a' else 'b') + etag2.substring(1)

        filesClient.completeMultipartUploads(listOf(FileIdAndEtags(fileIdAndUrls.fileId, listOf(etag1, wrongEtag2))))
            .andExpect(status().isUnprocessableContent)
            .andExpect(content().string(containsString("InvalidPart")))
    }

    @Test
    fun `GIVEN parts that are too small THEN the request is not valid`() {
        val fileIdAndUrls = filesClient.requestMultipartUploads(groupId, numberParts = 2)
            .andGetFileIdsAndMultipartUrls()[0]
        val etag1 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[0], "A".repeat(4 * 1024 * 1024))
            .headers().map()["etag"]!![0]
        val etag2 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[1], "B".repeat(7 * 1024 * 1024))
            .headers().map()["etag"]!![0]

        filesClient.completeMultipartUploads(listOf(FileIdAndEtags(fileIdAndUrls.fileId, listOf(etag1, etag2))))
            .andExpect(status().isUnprocessableContent)
            .andExpect(content().string(containsString("EntityTooSmall")))
    }
}
