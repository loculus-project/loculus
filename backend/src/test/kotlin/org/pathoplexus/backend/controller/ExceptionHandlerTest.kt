package org.pathoplexus.backend.controller

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.Test
import org.pathoplexus.backend.service.DatabaseService
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@SpringBootTest
@AutoConfigureMockMvc
class ExceptionHandlerTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean
    lateinit var databaseService: DatabaseService

    @Test
    fun `should handle unexpected exceptions`() {
        every { databaseService.insertSubmissions(any(), any()) }.throws(RuntimeException("test error message"))

        val submitFilesRequest = multipart("/submit")
            .file("sequences", "sequences".toByteArray())
            .file("metadata", "metadata".toByteArray())
            .param("username", "name")

        mockMvc.perform(submitFilesRequest)
            .andExpect(status().isInternalServerError)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.title").value("Internal Server Error"))
            .andExpect(jsonPath("$.message").value("test error message"))
    }
}
