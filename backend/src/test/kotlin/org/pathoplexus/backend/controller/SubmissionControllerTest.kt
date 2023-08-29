package org.pathoplexus.backend.controller

import org.assertj.core.api.Assertions.assertThat
import org.hamcrest.Matchers
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
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

    @BeforeEach
    fun beforeEach() {
        postgres.execInContainer(
            "psql",
            "-U",
            postgres.username,
            "-d",
            postgres.databaseName,
            "-c",
            "truncate table sequences restart identity cascade;",
        )
    }

    @Test
    fun `submit sequences`() {
        submitInitialData()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$[0].customId").value("Switzerland/BE-ETHZ-560470/2020"))
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

    @ParameterizedTest(name = "{arguments}")
    @MethodSource("provideTestData")
    fun `validation of processed data`(testScenario: TestScenario) {
        submitInitialData()

        val requestBuilder = submitProcessedData(testScenario.inputData)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$").isArray())

        if (testScenario.expectedValidationError == null) {
            requestBuilder.andExpect(jsonPath("\$").isEmpty())
        } else {
            val error = testScenario.expectedValidationError

            error.fieldsWithTypeMismatch.forEach { mismatch ->
                requestBuilder.andExpect(
                    jsonPath(
                        "\$[0].fieldsWithTypeMismatch",
                        Matchers.hasItem(
                            Matchers.allOf(
                                Matchers.hasEntry("field", mismatch.field),
                                Matchers.hasEntry("shouldBeType", mismatch.shouldBeType),
                                Matchers.hasEntry("fieldValue", mismatch.fieldValue),
                            ),
                        ),
                    ),
                )
            }
            requestBuilder.andExpect(
                jsonPath("\$[0].fieldsWithTypeMismatch", Matchers.hasSize<Any>(error.fieldsWithTypeMismatch.size)),
            )

            for (err in error.unknownFields) {
                requestBuilder.andExpect(jsonPath("\$[0].unknownFields", Matchers.hasItem(err)))
            }
            requestBuilder.andExpect(
                jsonPath("\$[0].unknownFields", Matchers.hasSize<String>(error.unknownFields.size)),
            )

            for (err in error.missingRequiredFields) {
                requestBuilder.andExpect(jsonPath("\$[0].missingRequiredFields", Matchers.hasItem(err)))
            }
            requestBuilder.andExpect(
                jsonPath("\$[0].missingRequiredFields", Matchers.hasSize<String>(error.missingRequiredFields.size)),
            )

            for (err in error.genericError) {
                requestBuilder.andExpect(jsonPath("\$[0].genericError", Matchers.hasItem(err)))
            }
            requestBuilder.andExpect(
                jsonPath("\$[0].genericError", Matchers.hasSize<String>(error.genericError.size)),
            )
        }
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

    private fun submitProcessedData(testData: String): ResultActions {
        return mockMvc.perform(
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
            "metadataFile",
            "metadata.tsv",
            MediaType.TEXT_PLAIN_VALUE,
            this.javaClass.classLoader.getResourceAsStream("metadata.tsv")?.readBytes() ?: error(
                "metadata.tsv not found",
            ),
        )

        val sequencesFile = MockMultipartFile(
            "sequenceFile",
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

        @JvmStatic
        fun provideTestData() = listOf(
            TestScenario(
                name = "Happy Path",
                submitData = true,
                inputData = """{"sequenceId":1,"data":{"date":"2002-12-15","host":"Homo sapiens","region":"Europe","country": "Spain","division":"Schaffhausen","nucleotideSequences":{"main":"NNNNNNNNNNNNNNNN"}}}""".trimIndent(), // ktlint-disable max-line-length
                expectedValidationError = null,
            ),
            TestScenario(
                name = "Unknown field",
                submitData = true,
                inputData = """{"sequenceId":1,"data":{"date":"2002-12-15","not_a_meta_data_field":"not_important","host":"Homo sapiens","country": "Spain","region":"Europe","division":"Schaffhausen","nucleotideSequences":{"main":"NNNNNNNNNNNNNNNN"}}}""".trimIndent(), // ktlint-disable max-line-length
                expectedValidationError = ValidationError(
                    id = 1,
                    missingRequiredFields = emptyList(),
                    fieldsWithTypeMismatch = emptyList(),
                    unknownFields = listOf("not_a_meta_data_field"),
                    genericError = emptyList(),
                ),
            ),
            TestScenario(
                name = "Missing required field",
                submitData = true,
                inputData = """{"sequenceId":1,"data":{"host":"Homo sapiens","region":"Europe","division":"Schaffhausen","nucleotideSequences":{"main":"NNNNNNNNNNNNNNNN"}}}""".trimIndent(), // ktlint-disable max-line-length
                expectedValidationError = ValidationError(
                    id = 1,
                    missingRequiredFields = listOf("date", "country"),
                    fieldsWithTypeMismatch = emptyList(),
                    unknownFields = emptyList(),
                    genericError = emptyList(),
                ),
            ),
            TestScenario(
                name = "Wrongly typed field",
                submitData = true,
                inputData = """{"sequenceId":1,"data":{"date":"15.12.2002","host":"Homo sapiens","region":"Europe","country": "Spain", "division":"Schaffhausen","nucleotideSequences":{"main":"NNNNNNNNNNNNNNNN"}}}""".trimIndent(), // ktlint-disable max-line-length
                expectedValidationError = ValidationError(
                    id = 1,
                    missingRequiredFields = emptyList(),
                    fieldsWithTypeMismatch = listOf(
                        TypeMismatch(field = "date", shouldBeType = "date", fieldValue = "\"15.12.2002\""),
                    ),
                    unknownFields = emptyList(),
                    genericError = emptyList(),
                ),
            ),
            TestScenario(
                name = "Invalid ID / Non-existing ID",
                submitData = false,
                inputData = """{"sequenceId":12,"data": "not important"}""".trimIndent(),
                expectedValidationError = ValidationError(
                    id = 12,
                    missingRequiredFields = emptyList(),
                    fieldsWithTypeMismatch = emptyList(),
                    unknownFields = emptyList(),
                    genericError = listOf("SequenceId does not exist"),
                ),
            ),
        )

        data class TestScenario(
            val name: String,
            val submitData: Boolean,
            val inputData: String,
            val expectedValidationError: ValidationError?,
        ) {
            override fun toString() = name
        }

        data class ValidationError(
            val id: Int,
            val missingRequiredFields: List<String>,
            val fieldsWithTypeMismatch: List<TypeMismatch>,
            val unknownFields: List<String>,
            val genericError: List<String>,
        )

        data class TypeMismatch(
            val field: String,
            val shouldBeType: String,
            val fieldValue: String,
        )
    }
}
