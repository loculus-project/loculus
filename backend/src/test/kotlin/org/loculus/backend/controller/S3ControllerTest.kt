package org.loculus.backend.controller

import io.mockk.every
import io.mockk.impl.annotations.MockK
import io.mockk.junit5.MockKExtension
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.loculus.backend.api.PresignedUrlRequest
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.service.storage.S3Service
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.loculus.backend.SpringBootTestWithoutDatabase
import org.loculus.backend.controller.RequestAuthorization.asUser
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.http.MediaType
import org.springframework.test.context.ContextConfiguration
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post

@ExtendWith(MockKExtension::class)
@WebMvcTest(S3Controller::class)
@ContextConfiguration(classes = [SpringBootTestWithoutDatabase::class, S3ControllerTest.TestConfig::class])
@ConditionalOnProperty(name = ["loculus.s3.enabled"], havingValue = "true", matchIfMissing = true)
class S3ControllerTest : EndpointTestExtension() {

    @MockK
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
                .asUser(AuthenticatedUser("user123", "user123", emptySet()))
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
                .asUser(AuthenticatedUser("user123", "user123", emptySet()))
        )
            .andExpect(status().isBadRequest)
    }

    @TestConfiguration
    class TestConfig {
        @Bean
        fun s3Service(): S3Service = io.mockk.mockk()
    }
}