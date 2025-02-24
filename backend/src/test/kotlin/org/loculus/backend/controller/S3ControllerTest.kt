package org.loculus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.SpringBootTestWithoutDatabase
import org.loculus.backend.api.PresignedUrlRequest
import org.loculus.backend.api.PresignedUrlResponse
import org.loculus.backend.service.storage.S3Service
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.context.ContextConfiguration
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@SpringBootTestWithoutDatabase
@AutoConfigureMockMvc
class S3ControllerTest {

    @Autowired
    private lateinit var mockMvc: MockMvc

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @MockkBean
    private lateinit var s3Service: S3Service

    @BeforeEach
    fun setup() {
        every { s3Service.generatePresignedUrl(any(), any()) } returns 
            Pair("https://bucket.s3.amazonaws.com/test-key?presigned-params", 3600L)
    }

    @Test
    fun `should generate presigned URL`() {
        val request = PresignedUrlRequest("test-file.txt", "text/plain")
        val requestJson = objectMapper.writeValueAsString(request)

        mockMvc.perform(
            post("/api/storage/presigned-url")
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestJson)
                .withAuth()
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.url").value("https://bucket.s3.amazonaws.com/test-key?presigned-params"))
            .andExpect(jsonPath("$.expiresIn").value(3600))
    }

    @Test
    fun `should fail with empty key`() {
        val request = PresignedUrlRequest("", "text/plain")
        val requestJson = objectMapper.writeValueAsString(request)

        mockMvc.perform(
            post("/api/storage/presigned-url")
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestJson)
                .withAuth()
        )
            .andExpect(status().isBadRequest)
    }
}