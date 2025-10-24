package org.loculus.backend.controller.submission

import com.fasterxml.jackson.module.kotlin.readValue
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.hasItems
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.FileIdAndEtags
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.api.Status.APPROVED_FOR_RELEASE
import org.loculus.backend.api.Status.IN_PROCESSING
import org.loculus.backend.api.Status.PROCESSED
import org.loculus.backend.api.Status.RECEIVED
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.DEFAULT_MULTIPART_FILE_CONTENT
import org.loculus.backend.controller.DEFAULT_MULTIPART_FILE_PARTS
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DEFAULT_SIMPLE_FILE_CONTENT
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.assertHasError
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.files.FilesClient
import org.loculus.backend.controller.files.andGetFileIdsAndMultipartUrls
import org.loculus.backend.controller.files.andGetFileIdsAndUrls
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jacksonObjectMapper
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.jwtForProcessingPipeline
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG"],
)
class SubmissionJourneyWithFilesTest(
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
    @Autowired val filesClient: FilesClient,
) {
    @Test
    fun `Simple file upload, submission, processing and approval, ending in get-released-data`() {
        val groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()
        val accessions = convenienceClient.submitDefaultFiles(groupId = groupId, includeFileMapping = true)
            .submissionIdMappings
            .map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(RECEIVED)

        val unprocessedData = convenienceClient.extractUnprocessedData()
        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(IN_PROCESSING)

        val fileUrl = unprocessedData.first().data.files!!.values.first().first().readUrl
        assertThat(downloadFromUrl(fileUrl), `is`(DEFAULT_SIMPLE_FILE_CONTENT))

        val fileIdAndUrl = filesClient.requestUploads(
            groupId = groupId,
            jwt = jwtForProcessingPipeline,
        ).andGetFileIdsAndUrls()[0]
        val pipelineFileContent = "Hello back!"
        convenienceClient.uploadFile(fileIdAndUrl.presignedWriteUrl, pipelineFileContent)
        val processedData = unprocessedData.map {
            val processed = PreparedProcessedData.successfullyProcessed(accession = it.accession)
            val fileCategory = it.data.files!!.keys.first()
            val unprocessedFile = it.data.files.values.first().first()
            processed.copy(
                data = processed.data.copy(
                    files = mapOf(
                        fileCategory to listOf(
                            FileIdAndName(unprocessedFile.fileId, unprocessedFile.name),
                            FileIdAndName(fileIdAndUrl.fileId, "processed.txt"),
                        ),
                    ),
                ),
            )
        }
        convenienceClient.submitProcessedData(processedData)
        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(PROCESSED)
            .assertHasError(false)

        convenienceClient.approveProcessedSequenceEntries(
            accessions.map {
                AccessionVersion(it, 1)
            },
        )
        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(APPROVED_FOR_RELEASE)

        val releasedData = convenienceClient.getReleasedData()
        val releasedFileMappingString = releasedData.first()["myFileCategory"]!!.asText()
        val fileMapping: List<Map<String, String>> = jacksonObjectMapper.readValue(releasedFileMappingString)
        assertThat(fileMapping.size, `is`(2))
        val contents = fileMapping.map { downloadFromUrl(it["url"]!!) }
        assertThat(
            contents,
            hasItems(
                DEFAULT_SIMPLE_FILE_CONTENT,
                pipelineFileContent,
            ),
        )
    }

    @Test
    fun `Multipart file upload, submission, processing and approval, ending in get-released-data`() {
        val groupId = groupManagementClient
            .createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andGetGroupId()

        val fileIdAndUrls = filesClient.requestMultipartUploads(groupId, numberParts = 2)
            .andGetFileIdsAndMultipartUrls()[0]
        val etag1 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[0], DEFAULT_MULTIPART_FILE_PARTS[0])
            .headers().map()["etag"]!![0]
        val etag2 = convenienceClient.uploadFile(fileIdAndUrls.presignedWriteUrls[1], DEFAULT_MULTIPART_FILE_PARTS[1])
            .headers().map()["etag"]!![0]
        filesClient.completeMultipartUploads(listOf(FileIdAndEtags(fileIdAndUrls.fileId, listOf(etag1, etag2))))
        val submissionResponse = submissionControllerClient.submit(
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
            .andReturn()
            .response
            .contentAsString
        val accessionWithFile = jacksonObjectMapper.readValue<List<Map<String, Any>>>(submissionResponse)
            .first { it["submissionId"] == "custom0" }["accession"].toString()

        convenienceClient.getSequenceEntry(accession = accessionWithFile, version = 1)
            .assertStatusIs(RECEIVED)

        val unprocessedData = convenienceClient.extractUnprocessedData()
        convenienceClient.getSequenceEntry(accession = accessionWithFile, version = 1)
            .assertStatusIs(IN_PROCESSING)

        val unprocessedDataWithFile = unprocessedData.first { it.accession == accessionWithFile }
        val fileUrl = unprocessedDataWithFile.data.files!!.values.first().first().readUrl
        assertThat(downloadFromUrl(fileUrl), `is`(DEFAULT_MULTIPART_FILE_CONTENT))

        val processedFileIdAndUrls = filesClient.requestMultipartUploads(
            groupId,
            numberParts = 2,
            jwt = jwtForProcessingPipeline,
        )
            .andGetFileIdsAndMultipartUrls()[0]
        val processedEtag1 = convenienceClient.uploadFile(
            processedFileIdAndUrls.presignedWriteUrls[0],
            DEFAULT_MULTIPART_FILE_PARTS[0],
        )
            .headers().map()["etag"]!![0]
        val processedEtag2 = convenienceClient.uploadFile(processedFileIdAndUrls.presignedWriteUrls[1], "_processed")
            .headers().map()["etag"]!![0]
        filesClient.completeMultipartUploads(
            listOf(FileIdAndEtags(processedFileIdAndUrls.fileId, listOf(processedEtag1, processedEtag2))),
            jwt = jwtForProcessingPipeline,
        )
        val pipelineFileContent = DEFAULT_MULTIPART_FILE_PARTS[0] + "_processed"
        val fileCategory = unprocessedDataWithFile.data.files.keys.first()
        val unprocessedFile = unprocessedDataWithFile.data.files.values.first().first()
        var processedEntry = PreparedProcessedData.successfullyProcessed(accession = accessionWithFile)
        processedEntry = processedEntry.copy(
            data = processedEntry.data.copy(
                files = mapOf(
                    fileCategory to listOf(
                        FileIdAndName(unprocessedFile.fileId, unprocessedFile.name),
                        FileIdAndName(
                            processedFileIdAndUrls.fileId,
                            "processed.txt",
                        ),
                    ),
                ),
            ),
        )
        convenienceClient.submitProcessedData(listOf(processedEntry))
        convenienceClient.getSequenceEntry(accession = accessionWithFile, version = 1)
            .assertStatusIs(PROCESSED)
            .assertHasError(false)

        convenienceClient.approveProcessedSequenceEntries(listOf(AccessionVersion(accessionWithFile, 1)))
        convenienceClient.getSequenceEntry(accession = accessionWithFile, version = 1)
            .assertStatusIs(APPROVED_FOR_RELEASE)

        val releasedData = convenienceClient.getReleasedData()
        val releasedFileMappingString = releasedData.first()["myFileCategory"]!!.asText()
        val fileMapping: List<Map<String, String>> = jacksonObjectMapper.readValue(releasedFileMappingString)
        assertThat(fileMapping.size, `is`(2))
        val contents = fileMapping.map { downloadFromUrl(it["url"]!!) }
        assertThat(
            contents,
            hasItems(
                DEFAULT_MULTIPART_FILE_CONTENT,
                pipelineFileContent,
            ),
        )
    }

    private fun downloadFromUrl(url: String): String {
        val httpClient = HttpClient.newHttpClient()
        val request = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        assertThat(response.statusCode(), `is`(200))
        return response.body()
    }
}
