package org.loculus.backend.controller.files

import com.fasterxml.jackson.module.kotlin.readValue
import io.minio.MinioClient
import io.minio.PutObjectArgs
import io.minio.StatObjectArgs
import io.minio.errors.ErrorResponseException
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.everyItem
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.api.FileIdAndMultipartWriteUrl
import org.loculus.backend.api.FileIdAndWriteUrl
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.config.S3Config
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jacksonObjectMapper
import org.loculus.backend.service.files.FileId
import org.loculus.backend.utils.FILE_ID_SEQUENCE_NAME
import org.loculus.backend.utils.fileIdToSequenceNumber
import org.loculus.backend.utils.generateFileId
import org.loculus.backend.utils.getNextSequenceNumber
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.io.ByteArrayInputStream
import java.util.concurrent.Callable
import java.util.concurrent.Executors

/**
 * Simulates a database reset that kept the bucket: objects already exist for the next IDs the sequence will issue.
 * The sequence is shared across the test run, so the stale block starts at the current sequence value instead of 1.
 */
@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG"],
)
class RequestUploadSkipsStoredFileIdsEndpointTest(
    @Autowired private val client: FilesClient,
    @Autowired private val groupManagementClient: GroupManagementControllerClient,
    @Autowired private val s3Config: S3Config,
) {
    private var groupId = 0
    private val minio by lazy {
        val bucket = s3Config.bucket!!
        MinioClient.builder().endpoint(bucket.endpoint).credentials(bucket.accessKey, bucket.secretKey).build()
    }

    @BeforeEach
    fun setup() {
        groupId = groupManagementClient.createNewGroup().andGetGroupId()
    }

    @Test
    fun `GIVEN no stored objects ahead of the sequence THEN issues consecutive IDs as before`() {
        val current = getNextSequenceNumber(FILE_ID_SEQUENCE_NAME)

        val fileIds = requestUploads(3)

        assertThat(fileIds.map(::sequenceNumberOf), `is`(listOf(current + 1, current + 2, current + 3)))
    }

    @Test
    fun `GIVEN the next IDs are stored THEN a single-file request skips past all of them`() {
        val stored = storeObjectsForNextSequenceNumbers(MORE_THAN_ONE_LISTING_PAGE)

        val fileIds = requestUploads(1)

        assertThat(fileIds.map(::sequenceNumberOf), everyItem(greaterThan(stored.max())))
        assertThat(fileIds.filter(::isStored), `is`(empty()))

        val nextFileIds = requestUploads(1)
        assertThat(sequenceNumberOf(nextFileIds.single()), `is`(sequenceNumberOf(fileIds.single()) + 1))
    }

    @Test
    fun `GIVEN the next IDs are stored THEN a batch request returns only unstored IDs`() {
        val stored = storeObjectsForNextSequenceNumbers(SMALL_STALE_BLOCK)

        val fileIds = requestUploads(SMALL_STALE_BLOCK / 2)

        assertThat(fileIds, hasSize(SMALL_STALE_BLOCK / 2))
        assertThat(fileIds.toSet(), hasSize(SMALL_STALE_BLOCK / 2))
        assertThat(fileIds.map(::sequenceNumberOf), everyItem(greaterThan(stored.max())))
        assertThat(fileIds.filter(::isStored), `is`(empty()))
    }

    @Test
    fun `GIVEN stored IDs with gaps THEN the gaps are used and no stored ID is issued`() {
        val current = getNextSequenceNumber(FILE_ID_SEQUENCE_NAME)
        val stored = listOf(1L, 2L, 4L, 5L, 6L).map { current + it }
        stored.forEach { storeObject(generateFileId(it)) }

        val fileIds = requestUploads(3)

        assertThat(fileIds.map(::sequenceNumberOf).filter { it in stored }, `is`(empty()))
        assertThat(fileIds.filter(::isStored), `is`(empty()))
        assertThat(fileIds.toSet(), hasSize(3))
    }

    @Test
    fun `GIVEN the next IDs are stored THEN multipart upload requests skip them too`() {
        val stored = storeObjectsForNextSequenceNumbers(SMALL_STALE_BLOCK)

        val responseContent = client.requestMultipartUploads(groupId, numberFiles = 2, numberParts = 1)
            .andExpect(status().isOk)
            .andReturn().response.contentAsString
        val fileIds = jacksonObjectMapper.readValue<List<FileIdAndMultipartWriteUrl>>(responseContent).map { it.fileId }

        assertThat(fileIds.map(::sequenceNumberOf), everyItem(greaterThan(stored.max())))
    }

    @Test
    fun `GIVEN the next IDs are stored WHEN requesting uploads concurrently THEN no ID is issued twice or stored`() {
        val stored = storeObjectsForNextSequenceNumbers(SMALL_STALE_BLOCK)
        val executor = Executors.newFixedThreadPool(8)

        val fileIds = try {
            executor.invokeAll((1..16).map { Callable { requestUploads(3) } }).flatMap { it.get() }
        } finally {
            executor.shutdown()
        }

        assertThat(fileIds, hasSize(48))
        assertThat(fileIds.toSet(), hasSize(48))
        assertThat(fileIds.map(::sequenceNumberOf).filter { it in stored }, `is`(empty()))
        assertThat(fileIds.filter(::isStored), `is`(empty()))
    }

    private fun requestUploads(numberFiles: Int): List<FileId> {
        val responseContent = client.requestUploads(groupId, numberFiles)
            .andExpect(status().isOk)
            .andReturn().response.contentAsString
        return jacksonObjectMapper.readValue<List<FileIdAndWriteUrl>>(responseContent).map { it.fileId }
    }

    private fun storeObjectsForNextSequenceNumbers(count: Int): List<Long> {
        val current = getNextSequenceNumber(FILE_ID_SEQUENCE_NAME)
        return (current + 1..current + count).onEach { storeObject(generateFileId(it)) }.toList()
    }

    private fun storeObject(fileId: FileId) {
        val content = "stale".toByteArray()
        minio.putObject(
            PutObjectArgs.builder()
                .bucket(s3Config.bucket!!.bucket)
                .`object`("files/$fileId")
                .stream(ByteArrayInputStream(content), content.size.toLong(), -1)
                .build(),
        )
    }

    private fun isStored(fileId: FileId): Boolean = try {
        minio.statObject(StatObjectArgs.builder().bucket(s3Config.bucket!!.bucket).`object`("files/$fileId").build())
        true
    } catch (e: ErrorResponseException) {
        if (e.errorResponse().code() == "NoSuchKey") false else throw e
    }

    private fun sequenceNumberOf(fileId: FileId): Long = fileIdToSequenceNumber(fileId)!!

    companion object {
        // larger than one ListObjectsV2 page (1000 keys), so the scan past the block has to paginate
        private const val MORE_THAN_ONE_LISTING_PAGE = 1_200
        private const val SMALL_STALE_BLOCK = 50
    }
}
