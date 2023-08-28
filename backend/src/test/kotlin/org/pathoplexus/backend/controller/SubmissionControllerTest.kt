package org.pathoplexus.backend.controller

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.pathoplexus.backend.service.Status
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.context.ActiveProfiles
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
@ActiveProfiles("test-with-database")
@AutoConfigureMockMvc
class SubmissionControllerTest(@Autowired val mockMvc: MockMvc) {

    private val testUsername = "testuser"

    // number of testdata sequences
    val numberOfSequences = 10

    companion object {
        private val postgres: PostgreSQLContainer<*> = PostgreSQLContainer<Nothing>("postgres:latest")
            .apply {
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
        submitInitialData()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$[0].header").value("Switzerland/BE-ETHZ-560470/2020"))
            .andExpect(jsonPath("\$[0].id").isNumber())
    }

    @Test
    fun `extract unprocessed sequences`() {
        val emptyResponse = queryUnprocessedSequences(numberOfSequences)
        expectLinesInResponse(emptyResponse, 0)

        submitInitialData()

        val result7 = queryUnprocessedSequences(7)
        expectLinesInResponse(result7, 7)

        val result3 = queryUnprocessedSequences(5)
        expectLinesInResponse(result3, 3)

        val result0 = queryUnprocessedSequences(numberOfSequences)
        expectLinesInResponse(result0, 0)
    }

    @Test
    fun `test updating processed data`() {
        submitInitialData()

        val result = queryUnprocessedSequences(numberOfSequences)
        val testData = expectLinesInResponse(result, numberOfSequences)

        submitProcessedData(testData)

        val response = mockMvc.perform(
            MockMvcRequestBuilders.post("/extract-processed-data")
                .param("numberOfSequences", numberOfSequences.toString()),
        )
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_NDJSON_VALUE))
            .andReturn()

        expectLinesInResponse(response, numberOfSequences)
    }

    @Test
    fun `get sequences of a user`() {
        submitInitialData()
        expectStatusInResponse(queryMySequenceList(), numberOfSequences, Status.RECEIVED.name)

        val testData = expectLinesInResponse(queryUnprocessedSequences(numberOfSequences), numberOfSequences)
        expectStatusInResponse(queryMySequenceList(), numberOfSequences, Status.PROCESSING.name)

        submitProcessedData(testData)
        expectStatusInResponse(queryMySequenceList(), numberOfSequences, Status.PROCESSED.name)

        expectLinesInResponse(
            mockMvc.perform(
                MockMvcRequestBuilders.post("/extract-processed-data")
                    .param("numberOfSequences", numberOfSequences.toString()),
            )
                .andExpect(status().isOk())
                .andReturn(),
            numberOfSequences,
        )

        expectStatusInResponse(queryMySequenceList(), numberOfSequences, Status.COMPLETED.name)
    }

    private fun submitProcessedData(testData: String) {
        mockMvc.perform(
            MockMvcRequestBuilders.post("/submit-processed-data")
                .contentType(MediaType.APPLICATION_NDJSON_VALUE)
                .content(testData),
        )
            .andExpect(status().isOk())
    }

    private fun queryMySequenceList(): MvcResult {
        return mockMvc.perform(
            MockMvcRequestBuilders.get("/get-sequences-of-user")
                .param("username", testUsername),
        )
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andReturn()
    }

    private fun submitInitialData(): ResultActions {
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
                .param("username", testUsername),
        )
    }

    private fun queryUnprocessedSequences(numberOfSequences: Int): MvcResult = mockMvc.perform(
        MockMvcRequestBuilders.post("/extract-unprocessed-data")
            .param("numberOfSequences", numberOfSequences.toString()),
    )
        .andExpect(status().isOk())
        .andExpect(content().contentType("application/x-ndjson"))
        .andReturn()

    private fun expectLinesInResponse(result: MvcResult, numberOfSequences: Int): String {
        await().until {
            result.response.isCommitted
        }
        val sequenceCount = result.response.contentAsString.count {
            it == '\n'
        }
        assertThat(sequenceCount).isEqualTo(numberOfSequences)

        return result.response.contentAsString
    }
    private fun expectStatusInResponse(result: MvcResult, numberOfSequences: Int, expectedStatus: String): String {
        await().until {
            result.response.isCommitted
        }

        val responseContent = result.response.contentAsString
        val statusCount = responseContent.split(expectedStatus).size - 1

        assertThat(statusCount).isEqualTo(numberOfSequences)

        return responseContent
    }
}
