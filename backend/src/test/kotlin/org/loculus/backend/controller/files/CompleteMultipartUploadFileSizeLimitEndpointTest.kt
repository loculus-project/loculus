package org.loculus.backend.controller.files

import com.fasterxml.jackson.databind.ObjectMapper
import org.hamcrest.CoreMatchers.containsString
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.api.FileIdAndEtags
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.config.readBackendConfig
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.DEFAULT_MULTIPART_FILE_PARTS
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.files.S3Service
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

private const val MAX_FILE_SIZE_BYTES = 1024L

/**
 * Reuses [S3_CONFIG], overriding just `fileSharing.maxFileSizeBytes` (well below the ~5 MB
 * [DEFAULT_MULTIPART_FILE_PARTS] file used elsewhere in these tests) via [BackendConfigWithMaxFileSizeTestConfig],
 * rather than duplicating the whole config file for one differing setting.
 */
@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG"],
)
@Import(BackendConfigWithMaxFileSizeTestConfig::class)
@TestPropertySource(properties = ["spring.main.allow-bean-definition-overriding=true"])
class CompleteMultipartUploadFileSizeLimitEndpointTest(
    @Autowired private val groupManagementClient: GroupManagementControllerClient,
    @Autowired private val filesClient: FilesClient,
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val s3Service: S3Service,
    @Autowired private val filesDatabaseService: FilesDatabaseService,
) {

    var groupId: Int = 0

    @BeforeEach
    fun prepareNewGroup() {
        groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
    }

    @Test
    fun `GIVEN a file exceeding maxFileSizeBytes THEN completion is rejected and the upload is aborted`() {
        val fileIdAndUrls = filesClient.requestMultipartUploads(
            groupId = groupId,
            numberParts = 2,
        ).andGetFileIdsAndMultipartUrls()[0]
        val etag1 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[0], DEFAULT_MULTIPART_FILE_PARTS[0])
            .headers().map()["etag"]!![0]
        val etag2 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[1], DEFAULT_MULTIPART_FILE_PARTS[1])
            .headers().map()["etag"]!![0]

        filesClient.completeMultipartUploads(listOf(FileIdAndEtags(fileIdAndUrls.fileId, listOf(etag1, etag2))))
            .andExpect(status().isUnprocessableContent)
            .andExpect(
                content().string(containsString("exceeds the maximum allowed file size of $MAX_FILE_SIZE_BYTES bytes")),
            )
            .andExpect(content().string(containsString(fileIdAndUrls.fileId)))

        // The file should be discarded from S3 and the database.
        assertNull(s3Service.getFileSize(fileIdAndUrls.fileId))
        assertTrue(
            filesDatabaseService.getNonExistentFileIds(setOf(fileIdAndUrls.fileId)).contains(fileIdAndUrls.fileId),
        )
    }

    @Test
    fun `GIVEN a file within maxFileSizeBytes THEN completion succeeds`() {
        val fileIdAndUrls = filesClient.requestMultipartUploads(
            groupId = groupId,
            numberParts = 1,
        ).andGetFileIdsAndMultipartUrls()[0]
        val etag = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[0], "small file content")
            .headers().map()["etag"]!![0]

        filesClient.completeMultipartUploads(listOf(FileIdAndEtags(fileIdAndUrls.fileId, listOf(etag))))
            .andExpect(status().isOk)

        assertNotNull(s3Service.getFileSize(fileIdAndUrls.fileId))
    }
}

@TestConfiguration
class BackendConfigWithMaxFileSizeTestConfig {
    @Bean
    @Primary
    fun configWithMaxFileSize(
        objectMapper: ObjectMapper,
        @Value("\${${BackendSpringProperty.BACKEND_CONFIG_PATH}}") configPath: String,
    ): BackendConfig {
        val originalConfig = readBackendConfig(objectMapper = objectMapper, configPath = configPath)
        return originalConfig.copy(
            fileSharing = originalConfig.fileSharing.copy(maxFileSizeBytes = MAX_FILE_SIZE_BYTES),
        )
    }
}
