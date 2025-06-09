package org.loculus.backend.controller.submission

import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_MULTIPART_FILE_PARTS
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.files.FilesClient
import org.loculus.backend.controller.files.andGetFileIdsAndMultipartUrls
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType.APPLICATION_JSON_VALUE
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.util.*

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG"],
)
class SubmitEndpointMultipartFileSharingTest(
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val filesClient: FilesClient,
    @Autowired val backendConfig: BackendConfig,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
) {
    var groupId: Int = 0

    @BeforeEach
    fun prepareNewGroup() {
        groupId = groupManagementClient.createNewGroup().andGetGroupId()
    }

    @Test
    fun `GIVEN a valid multipart upload THEN the request is valid`() {
        val fileIdAndUrls = filesClient.requestMultipartUploads(groupId, numberParts = 2)
            .andGetFileIdsAndMultipartUrls()[0]
        val etag1 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[0], DEFAULT_MULTIPART_FILE_PARTS[0])
            .headers().map()["etag"]!![0]
        val etag2 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[1], DEFAULT_MULTIPART_FILE_PARTS[1])
            .headers().map()["etag"]!![0]

        submissionControllerClient.submit(
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFile,
            organism = DEFAULT_ORGANISM,
            groupId = groupId,
            fileMapping = mapOf(
                "custom0" to mapOf(
                    "myFileCategory" to listOf(
                        FileIdAndName(
                            fileIdAndUrls.fileId,
                            "foo.txt",
                            listOf(etag1, etag2),
                        ),
                    ),
                ),
            ),
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(NUMBER_OF_SEQUENCES))
            .andExpect(jsonPath("\$[0].submissionId").value("custom0"))
            .andExpect(jsonPath("\$[0].accession", containsString(backendConfig.accessionPrefix)))
            .andExpect(jsonPath("\$[0].version").value(1))
    }

    @Test
    fun `GIVEN missing etags THEN the request is not valid`() {
        val fileIdAndUrls = filesClient.requestMultipartUploads(groupId, numberParts = 2)
            .andGetFileIdsAndMultipartUrls()[0]
        convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[0], DEFAULT_MULTIPART_FILE_PARTS[0])
        convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[1], DEFAULT_MULTIPART_FILE_PARTS[1])

        submissionControllerClient.submit(
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFile,
            organism = DEFAULT_ORGANISM,
            groupId = groupId,
            fileMapping = mapOf(
                "custom0" to mapOf(
                    "myFileCategory" to listOf(
                        FileIdAndName(
                            fileIdAndUrls.fileId,
                            "foo.txt",
                        ),
                    ),
                ),
            ),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().string(containsString("No etags provided")))
    }

    @Test
    fun `GIVEN a wrong etag THEN the request is not valid`() {
        val fileIdAndUrls = filesClient.requestMultipartUploads(groupId, numberParts = 2)
            .andGetFileIdsAndMultipartUrls()[0]
        val etag1 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[0], DEFAULT_MULTIPART_FILE_PARTS[0])
            .headers().map()["etag"]!![0]
        val etag2 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[1], DEFAULT_MULTIPART_FILE_PARTS[1])
            .headers().map()["etag"]!![0]
        val wrongEtag2 = (if (etag2[0] != 'a') 'a' else 'b') + etag2.substring(1)

        submissionControllerClient.submit(
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFile,
            organism = DEFAULT_ORGANISM,
            groupId = groupId,
            fileMapping = mapOf(
                "custom0" to mapOf(
                    "myFileCategory" to listOf(
                        FileIdAndName(
                            fileIdAndUrls.fileId,
                            "foo.txt",
                            listOf(etag1, wrongEtag2),
                        ),
                    ),
                ),
            ),
        )
            .andExpect(status().isUnprocessableEntity)
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

        submissionControllerClient.submit(
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFile,
            organism = DEFAULT_ORGANISM,
            groupId = groupId,
            fileMapping = mapOf(
                "custom0" to mapOf(
                    "myFileCategory" to listOf(
                        FileIdAndName(
                            fileIdAndUrls.fileId,
                            "foo.txt",
                            listOf(etag1, etag2),
                        ),
                    ),
                ),
            ),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().string(containsString("EntityTooSmall")))
    }

    @Test
    fun `GIVEN a valid multipart upload, used in multiple submissions, THEN the request is valid`() {
        val fileIdAndUrls = filesClient.requestMultipartUploads(groupId, numberParts = 2)
            .andGetFileIdsAndMultipartUrls()[0]
        val etag1 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[0], DEFAULT_MULTIPART_FILE_PARTS[0])
            .headers().map()["etag"]!![0]
        val etag2 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[1], DEFAULT_MULTIPART_FILE_PARTS[1])
            .headers().map()["etag"]!![0]

        repeat(2) {
            submissionControllerClient.submit(
                DefaultFiles.metadataFile,
                DefaultFiles.sequencesFile,
                organism = DEFAULT_ORGANISM,
                groupId = groupId,
                fileMapping = mapOf(
                    "custom0" to mapOf(
                        "myFileCategory" to listOf(
                            FileIdAndName(
                                fileIdAndUrls.fileId,
                                "foo.txt",
                                listOf(etag1, etag2),
                            ),
                        ),
                    ),
                    "custom1" to mapOf(
                        "myFileCategory" to listOf(
                            FileIdAndName(
                                fileIdAndUrls.fileId,
                                "foo.txt",
                                listOf(etag1, etag2),
                            ),
                        ),
                    ),
                ),
            )
                .andExpect(status().isOk)
        }

        submissionControllerClient.submit(
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFile,
            organism = DEFAULT_ORGANISM,
            groupId = groupId,
            fileMapping = mapOf(
                "custom0" to mapOf(
                    "myFileCategory" to listOf(
                        FileIdAndName(
                            fileIdAndUrls.fileId,
                            "foo.txt",
                        ),
                    ),
                ),
            ),
        )
            .andExpect(status().isOk)
    }
}
