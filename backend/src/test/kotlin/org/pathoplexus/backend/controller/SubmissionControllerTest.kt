package org.pathoplexus.backend.controller

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.MvcResult
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.shaded.org.awaitility.Awaitility.await

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

    @BeforeEach
    fun beforeEach() {
        postgres.execInContainer(
            "psql",
            "-U",
            postgres.username,
            "-d",
            postgres.databaseName,
            "-c",
            "truncate table sequences cascade;",
        )
    }

    @Test
    fun `submit sequences`() {
        submitTestData()
            .andExpect(status().isOk)
            .andExpect(content().contentType("application/json"))
            .andExpect(jsonPath("\$[0].header").value("Switzerland/BE-ETHZ-560470/2020"))
            .andExpect(jsonPath("\$[0].id").isNumber())
    }

    @Test
    fun `extract unprocessed sequences`() {
        val numberOfSequences = 10

        val emptyResponse = queryUnprocessedSequences(numberOfSequences)

        waitAndCountLinesInResponse(emptyResponse, 0)

        submitTestData()

        val result7 = queryUnprocessedSequences(7)
        waitAndCountLinesInResponse(result7, 7)

        val result3 = queryUnprocessedSequences(5)
        waitAndCountLinesInResponse(result3, 3)

        val result0 = queryUnprocessedSequences(numberOfSequences)
        waitAndCountLinesInResponse(result0, 0)
    }

    private fun submitTestData(): ResultActions {
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

        return mockMvc.perform(
            MockMvcRequestBuilders.multipart("/submit")
                .file(metadataFile)
                .file(sequencesFile)
                .param("username", "Parker"),
        )
    }

    private fun queryUnprocessedSequences(numberOfSequences: Int): MvcResult = mockMvc.perform(
        MockMvcRequestBuilders.post("/extract-unprocessed-data")
            .param("numberOfSequences", numberOfSequences.toString()),
    )
        .andExpect(status().isOk())
        .andExpect(content().contentType("application/x-ndjson"))
        .andReturn()

    private fun waitAndCountLinesInResponse(result: MvcResult, numberOfSequences: Int) {
        await().until {
            result.response.isCommitted
        }
        val sequenceCount = result.response.contentAsString.count {
            it == '\n'
        }
        assertThat(sequenceCount).isEqualTo(numberOfSequences)
    }
}
