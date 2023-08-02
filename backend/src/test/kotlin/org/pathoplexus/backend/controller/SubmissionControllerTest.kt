package org.pathoplexus.backend.controller

import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.containers.PostgreSQLContainer

@SpringBootTest
@AutoConfigureMockMvc
class SubmissionControllerTest(@Autowired val mockMvc: MockMvc) {
    companion object {
        private val postgres: PostgreSQLContainer<*> = PostgreSQLContainer<Nothing>("postgres:latest")
            .apply {
                withInitScript("database/init.sql")
                start()
            }

        @JvmStatic
        @DynamicPropertySource
        fun setDataSourceProperties(registry: DynamicPropertyRegistry) {
            registry.add("database.jdbcUrl", postgres::getJdbcUrl)
            registry.add("database.username", postgres::getUsername)
            registry.add("database.password", postgres::getPassword)
        }

        @AfterAll
        @JvmStatic
        fun afterAll() {
            postgres.stop()
        }
    }

    @Test
    fun `test aggregated POST endpoint`() {
        val metadataFile = MockMultipartFile(
            "metadata",
            "metadata.tsv",
            MediaType.TEXT_PLAIN_VALUE,
            this.javaClass.classLoader.getResourceAsStream("metadata.tsv")?.readBytes() ?: error(
                "metadata.tsv not found",
            ),
        )

        val sequencesFile = MockMultipartFile(
            "sequences",
            "sequences.fasta",
            MediaType.TEXT_PLAIN_VALUE,
            this.javaClass.classLoader.getResourceAsStream("sequences.fasta")?.readBytes() ?: error(
                "sequences.fasta not found",
            ),
        )

        mockMvc.perform(
            MockMvcRequestBuilders.multipart("/submit")
                .file(metadataFile)
                .file(sequencesFile)
                .param("username", "Parker"),
        )
            .andExpect(status().isOk())
            .andExpect(content().contentType("application/json"))
            .andExpect(jsonPath("\$[0].header").value("Switzerland/BE-ETHZ-560470/2020"))
            .andExpect(jsonPath("\$[0].id").isNumber())
    }
}
