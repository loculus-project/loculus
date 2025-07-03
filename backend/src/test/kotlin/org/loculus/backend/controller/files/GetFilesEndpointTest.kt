package org.loculus.backend.controller.files

import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.jwtForAlternativeUser
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.submission.PreparedProcessedData
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG"],
)
class GetFilesEndpointTest(
    @Autowired private val
    submissionConvenienceClient: SubmissionConvenienceClient,
    @Autowired private val filesClient: FilesClient,
) {
    @Test
    fun `GIVEN an unpublished file WHEN requesting without auth THEN an error is raised`() {
        submissionConvenienceClient.submitDefaultFiles(includeFileMapping = true)
        val data = submissionConvenienceClient.extractUnprocessedData().first()
        submissionConvenienceClient.submitProcessedData(
            PreparedProcessedData.withFiles(
                data.accession,
                data.data.files!!.map {
                    Pair(it.key, it.value.map { FileIdAndName(it.fileId, it.name) })
                }.toMap(),
            ),
        )

        filesClient.getFile(data.accession, data.version, "myFileCategory", "hello.txt")
            .andExpect(status().isUnauthorized())
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath(
                    "\$.detail",
                    containsString("file is not public"),
                ),
            )
    }

    @Test
    fun `GIVEN an unpublished file WHEN requesting with auth THEN the file is returned`() {
        submissionConvenienceClient.submitDefaultFiles(includeFileMapping = true)
        val data = submissionConvenienceClient.extractUnprocessedData().first()
        submissionConvenienceClient.submitProcessedData(
            PreparedProcessedData.withFiles(
                data.accession,
                data.data.files!!.map {
                    Pair(it.key, it.value.map { FileIdAndName(it.fileId, it.name) })
                }.toMap(),
            ),
        )

        filesClient.getFile(data.accession, data.version, "myFileCategory", "hello.txt", jwt = jwtForDefaultUser)
            .andExpect(status().is3xxRedirection())
    }

    @Test
    fun `GIVEN an unpublished file WHEN requesting with alternative user THEN access is forbidden`() {
        submissionConvenienceClient.submitDefaultFiles(includeFileMapping = true)
        val data = submissionConvenienceClient.extractUnprocessedData().first()
        submissionConvenienceClient.submitProcessedData(
            PreparedProcessedData.withFiles(
                data.accession,
                data.data.files!!.map {
                    Pair(it.key, it.value.map { FileIdAndName(it.fileId, it.name) })
                }.toMap(),
            ),
        )

        filesClient.getFile(data.accession, data.version, "myFileCategory", "hello.txt", jwt = jwtForAlternativeUser)
            .andExpect(status().isForbidden())
    }
}
