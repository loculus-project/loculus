package org.loculus.backend.controller.files

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.`is`
import org.hamcrest.Matchers.notNullValue
import org.junit.jupiter.api.Test
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.jwtForAlternativeUser
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.submission.PreparedProcessedData
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.controller.toAccessionVersion
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MvcResult
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.net.http.HttpResponse

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

    @Test
    fun `GIVEN an unpublished file WHEN HEAD without auth THEN an error is raised`() {
        submissionConvenienceClient.submitDefaultFiles(includeFileMapping = true)
        val data = submissionConvenienceClient.extractUnprocessedData().first()
        submissionConvenienceClient.submitProcessedData(
            PreparedProcessedData.withFiles(
                data.accession,
                data.data.files!!.map { Pair(it.key, it.value.map { FileIdAndName(it.fileId, it.name) }) }.toMap(),
            ),
        )

        filesClient.headFile(data.accession, data.version, "myFileCategory", "hello.txt")
            .andExpect(status().isUnauthorized())
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("\$.detail", containsString("file is not public")))
    }

    @Test
    fun `GIVEN an unpublished file WHEN HEAD with auth THEN a correct redirect Location is returned`() {
        submissionConvenienceClient.submitDefaultFiles(includeFileMapping = true)
        val data = submissionConvenienceClient.extractUnprocessedData().first()
        submissionConvenienceClient.submitProcessedData(
            PreparedProcessedData.withFiles(
                data.accession,
                data.data.files!!.map { Pair(it.key, it.value.map { FileIdAndName(it.fileId, it.name) }) }.toMap(),
            ),
        )

        val mvcResult = filesClient.headFile(
            data.accession,
            data.version,
            "myFileCategory",
            "hello.txt",
            jwt = jwtForDefaultUser,
        )
            .andExpect(status().is3xxRedirection())
            .andExpect(header().string("Location", notNullValue()))
            .andReturn()
        assertRedirectLocationIsOk(mvcResult)
    }

    @Test
    fun `GIVEN a published file WHEN HEAD without auth THEN a correct redirect Location is returned`() {
        submissionConvenienceClient.submitDefaultFiles(includeFileMapping = true)
        val data = submissionConvenienceClient.extractUnprocessedData().first()
        submissionConvenienceClient.submitProcessedData(
            PreparedProcessedData.withFiles(
                data.accession,
                data.data.files!!.map { Pair(it.key, it.value.map { FileIdAndName(it.fileId, it.name) }) }.toMap(),
            ),
        )
        submissionConvenienceClient.approveProcessedSequenceEntries(listOf(data))

        val mvcResult = filesClient.headFile(
            data.accession,
            data.version,
            "myFileCategory",
            "hello.txt",
            jwt = jwtForDefaultUser,
        )
            .andExpect(status().is3xxRedirection())
            .andExpect(header().string("Location", notNullValue()))
            .andReturn()
        assertRedirectLocationIsOk(mvcResult)
    }

    private fun assertRedirectLocationIsOk(mvcResult: MvcResult) {
        val location = mvcResult.response.getHeader("Location")!!
        val client = java.net.http.HttpClient.newHttpClient()
        val redirectedRequest = java.net.http.HttpRequest.newBuilder(java.net.URI.create(location))
            .method("HEAD", java.net.http.HttpRequest.BodyPublishers.noBody())
            .build()
        val redirectedResponse = client.send(redirectedRequest, HttpResponse.BodyHandlers.discarding())
        assertThat(redirectedResponse.statusCode(), `is`(200))
    }
}
