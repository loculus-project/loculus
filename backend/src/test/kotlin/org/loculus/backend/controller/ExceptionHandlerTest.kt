package org.loculus.backend.controller

import com.ninjasquad.springmockk.MockkBean
import io.mockk.MockKAnnotations
import io.mockk.MockKMatcherScope
import io.mockk.every
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.SpringBootTestWithoutDatabase
import org.loculus.backend.api.DataUseTermsType
import org.loculus.backend.api.SubmissionIdMapping
import org.loculus.backend.model.SubmitModel
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

private val validRoute = addOrganismToPath("submit")

private val validRequest: MockHttpServletRequestBuilder = multipart(validRoute)
    .file("sequenceFile", "sequences".toByteArray())
    .file("metadataFile", "metadata".toByteArray())
    .param("groupId", "5")
    .param("dataUseTermsType", DataUseTermsType.OPEN.name)
    .withAuth()

private val validResponse = emptyList<SubmissionIdMapping>()

@SpringBootTestWithoutDatabase
@AutoConfigureMockMvc
class ExceptionHandlerTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean
    lateinit var submissionController: SubmissionController

    @BeforeEach
    fun setUp() {
        MockKAnnotations.init(this)
    }

    private fun MockKMatcherScope.validControllerCall() = submissionController.submit(
        any(),
        any(),
        any(),
        any(),
        any(),
        any(),
        any(),
        any(),
    )

    @Test
    fun `throw NOT_FOUND(404) when route is not found`() {
        every { validControllerCall() } returns validResponse

        mockMvc.perform(get("/notAValidRoute").withAuth())
            .andExpect(status().isNotFound)
    }

    @Test
    fun `GIVEN unspecific exception is thrown THEN return Internal Server Error (500)`() {
        every { validControllerCall() } throws IllegalArgumentException("SomeMessage")

        mockMvc.perform(validRequest)
            .andExpect(status().isInternalServerError)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.title").value("Internal Server Error"))
            .andExpect(jsonPath("$.detail").value("SomeMessage"))
    }

    @Test
    fun `GIVEN InvalidSequenceFileException is thrown THEN returns Unprocessable Entity (422)`() {
        every { validControllerCall() } throws UnprocessableEntityException("SomeMessage")

        mockMvc.perform(validRequest)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.title").value("Unprocessable Entity"))
            .andExpect(jsonPath("$.detail").value("SomeMessage"))
    }

    @Test
    fun `GIVEN ProcessingException is thrown THEN returns Unprocessable Entity (422)`() {
        every { validControllerCall() } throws ProcessingValidationException("SomeMessage")

        mockMvc.perform(validRequest)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.title").value("Unprocessable Entity"))
            .andExpect(jsonPath("$.detail").value("SomeMessage"))
    }

    @Test
    fun `WHEN I submit a request with invalid schema THEN it should return a descriptive error message`() {
        mockMvc.perform(
            post(addOrganismToPath("/approve-processed-data"))
                .param("username", "userName")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"fieldThatIsDefinitelyNotScopeWhichIsRequired": null}""")
                .withAuth(),
        )
            .andExpect(status().isBadRequest)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.title").value("Bad Request"))
            .andExpect(jsonPath("$.detail", containsString("for creator parameter scope which is a non-nullable type")))
    }
}

@SpringBootTestWithoutDatabase
@AutoConfigureMockMvc
class ExceptionHandlerWithMockedModelTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean
    lateinit var submitModel: SubmitModel

    @Test
    fun `WHEN I submit a request with invalid organism THEN it should return a descriptive error message`() {
        every { submitModel.processSubmissions(any(), any()) } returns validResponse

        mockMvc.perform(
            multipart("/unknownOrganism/submit")
                .file("sequenceFile", "sequences".toByteArray())
                .file("metadataFile", "metadata".toByteArray())
                .param("groupId", "5")
                .param("dataUseTermsType", DataUseTermsType.OPEN.name)
                .withAuth(),
        )
            .andExpect(status().isBadRequest)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.title").value("Bad Request"))
            .andExpect(jsonPath("$.detail", containsString("Invalid organism: unknownOrganism")))
    }
}
