package org.pathoplexus.backend.controller

import SpringBootTestWithoutDatabase
import com.ninjasquad.springmockk.MockkBean
import io.mockk.MockKAnnotations
import io.mockk.MockKMatcherScope
import io.mockk.every
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.pathoplexus.backend.model.HeaderId
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@SpringBootTestWithoutDatabase
@AutoConfigureMockMvc
class ExceptionHandlerTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean
    lateinit var submissionController: SubmissionController

    @BeforeEach
    fun setUp() {
        MockKAnnotations.init(this)
    }

    private val validRoute = "/submit"
    private fun MockKMatcherScope.validControllerCall() =
        submissionController.submit(any(), any(), any())

    val validRequest: MockHttpServletRequestBuilder = multipart(validRoute)
        .file("sequenceFile", "sequences".toByteArray())
        .file("metadataFile", "metadata".toByteArray())
        .param("username", "name")

    private val validResponse = emptyList<HeaderId>()

    @Test
    fun `throw NOT_FOUND(404) when route is not found`() {
        every { validControllerCall() } returns validResponse

        mockMvc.perform(get("/notAValidRoute"))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `GIVEN unspecific exception is thrown THEN return Internal Server Error (500)`() {
        every { validControllerCall() } throws IllegalArgumentException("SomeMessage")

        mockMvc.perform(validRequest)
            .andExpect(status().isInternalServerError)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.title").value("Internal Server Error"))
            .andExpect(jsonPath("$.detail").value("SomeMessage"))
    }

    @Test
    fun `GIVEN InvalidSequenceFileException is thrown THEN returns Unprocessable Entity (422)`() {
        every { validControllerCall() } throws UnprocessableEntityException("SomeMessage")

        mockMvc.perform(validRequest)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.title").value("Unprocessable Entity"))
            .andExpect(jsonPath("$.detail").value("SomeMessage"))
    }

    @Test
    fun `GIVEN ProcessingException is thrown THEN returns Unprocessable Entity (422)`() {
        every { validControllerCall() } throws ProcessingException("SomeMessage")

        mockMvc.perform(validRequest)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.title").value("Unprocessable Entity"))
            .andExpect(jsonPath("$.detail").value("SomeMessage"))
    }

    @Test
    fun `WHEN I submit a request with invalid schema THEN it should return a descriptive error message`() {
        mockMvc.perform(
            post("/approve-processed-data")
                .param("username", "userName")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"fieldThatDoesNotExist": null}"""),
        )
            .andExpect(status().isBadRequest)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.title").value("Bad Request"))
            .andExpect(jsonPath("$.detail", containsString("failed for JSON property sequenceVersions")))
    }
}
