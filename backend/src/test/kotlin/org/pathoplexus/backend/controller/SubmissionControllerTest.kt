package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES
import org.pathoplexus.backend.service.SequenceVersion
import org.pathoplexus.backend.service.SequenceVersionStatus
import org.pathoplexus.backend.service.Status
import org.pathoplexus.backend.service.UnprocessedData
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
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.shaded.org.awaitility.Awaitility.await

@AutoConfigureMockMvc
@SpringBootTest
@ActiveProfiles("with-database")
class SubmissionControllerTest(
    @Autowired val mockMvc: MockMvc,
    @Autowired val objectMapper: ObjectMapper,
) {

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
    fun `workflow from initial submit to releasable data and creating a new version`() {
        submitInitialData()
        expectStatusInResponse(querySequenceList(), NUMBER_OF_SEQUENCES, Status.RECEIVED.name)

        val rawUnprocessedData = expectLinesInResponse(
            queryUnprocessedSequences(NUMBER_OF_SEQUENCES),
            NUMBER_OF_SEQUENCES,
        )
        expectStatusInResponse(querySequenceList(), NUMBER_OF_SEQUENCES, Status.PROCESSING.name)

        submitProcessedData(dummyPreprocessing(rawUnprocessedData))
        expectStatusInResponse(querySequenceList(), NUMBER_OF_SEQUENCES, Status.PROCESSED.name)

        approveProcessedSequences(DefaultFiles.allSequenceIds.map { SequenceVersion(it, 1) })
        expectStatusInResponse(querySequenceList(), NUMBER_OF_SEQUENCES, Status.SILO_READY.name)

        reviseSiloReadySequences()
        expectStatusInResponse(querySequenceList(), NUMBER_OF_SEQUENCES, Status.RECEIVED.name)
    }

    @Test
    fun `verify that versions only go up`() {
        prepareDataToSiloReady()

        assertThat(getSequenceList().filter { it.sequenceId == DefaultFiles.firstSequence })
            .hasSize(1)
            .contains(
                SequenceVersionStatus(
                    sequenceId = DefaultFiles.firstSequence,
                    version = 1,
                    status = Status.SILO_READY,
                    isRevocation = false,
                ),
            )

        reviseSiloReadySequences()

        assertThat(getSequenceList().filter { it.sequenceId == DefaultFiles.firstSequence })
            .hasSize(2)
            .contains(
                SequenceVersionStatus(
                    sequenceId = DefaultFiles.firstSequence,
                    version = 1,
                    status = Status.SILO_READY,
                    isRevocation = false,
                ),
            ).contains(
                SequenceVersionStatus(
                    sequenceId = DefaultFiles.firstSequence,
                    version = 2,
                    status = Status.RECEIVED,
                    isRevocation = false,
                ),
            )
    }

    @Test
    fun `revoke sequences and check that the 'revoke' flag is set properly`() {
        prepareDataToSiloReady()

        assertThat(getSequenceList().filter { it.sequenceId == DefaultFiles.firstSequence })
            .hasSize(1)
            .contains(
                SequenceVersionStatus(
                    sequenceId = DefaultFiles.firstSequence,
                    version = 1,
                    status = Status.SILO_READY,
                    isRevocation = false,
                ),
            )

        revokeSequences(DefaultFiles.allSequenceIds)

        assertThat(getSequenceList().filter { it.sequenceId == DefaultFiles.firstSequence })
            .hasSize(2)
            .contains(
                SequenceVersionStatus(
                    sequenceId = DefaultFiles.firstSequence,
                    version = 1,
                    status = Status.SILO_READY,
                    isRevocation = false,
                ),
            ).contains(
                SequenceVersionStatus(
                    sequenceId = DefaultFiles.firstSequence,
                    version = 2,
                    status = Status.REVOKED_STAGING,
                    isRevocation = true,
                ),
            )

        confirmRevocation(DefaultFiles.allSequenceIds)

        assertThat(getSequenceList().filter { it.sequenceId == DefaultFiles.firstSequence })
            .hasSize(1)
            .contains(
                SequenceVersionStatus(
                    sequenceId = DefaultFiles.firstSequence,
                    version = 2,
                    status = Status.SILO_READY,
                    isRevocation = true,
                ),
            )
    }

    @Test
    fun `revise sequences`() {
        prepareDataToSiloReady()

        assertThat(getSequenceList().filter { it.sequenceId == DefaultFiles.firstSequence })
            .hasSize(1)
            .contains(
                SequenceVersionStatus(
                    sequenceId = DefaultFiles.firstSequence,
                    version = 1,
                    status = Status.SILO_READY,
                    isRevocation = false,
                ),
            )

        reviseSiloReadySequences()
            .andExpect(status().isOk)

        assertThat(getSequenceList().filter { it.sequenceId == DefaultFiles.firstSequence })
            .hasSize(2)
            .contains(
                SequenceVersionStatus(
                    sequenceId = DefaultFiles.firstSequence,
                    version = 1,
                    status = Status.SILO_READY,
                    isRevocation = false,
                ),
            ).contains(
                SequenceVersionStatus(
                    sequenceId = DefaultFiles.firstSequence,
                    version = 2,
                    status = Status.RECEIVED,
                    isRevocation = false,
                ),
            )
    }

    @Test
    fun `revise sequences where the latest version is not SILO_READY`() {
        submitInitialData()

        assertThat(getSequenceList().filter { it.sequenceId == DefaultFiles.firstSequence })
            .hasSize(1)
            .contains(
                SequenceVersionStatus(
                    sequenceId = DefaultFiles.firstSequence,
                    version = 1,
                    status = Status.RECEIVED,
                    isRevocation = false,
                ),
            )

        reviseSiloReadySequences()

        assertThat(getSequenceList().filter { it.sequenceId == DefaultFiles.firstSequence })
            .hasSize(1)
            .contains(
                SequenceVersionStatus(
                    sequenceId = DefaultFiles.firstSequence,
                    version = 1,
                    status = Status.RECEIVED,
                    isRevocation = false,
                ),
            )
    }

    @Test
    fun `revise sequences with erroneous new input data that cannot be mapped to existing sequenceIds`() {
        prepareDataToSiloReady()

        assertThat(getSequenceList().filter { it.sequenceId == DefaultFiles.firstSequence })
            .hasSize(1)
            .contains(
                SequenceVersionStatus(
                    sequenceId = DefaultFiles.firstSequence,
                    version = 1,
                    status = Status.SILO_READY,
                    isRevocation = false,
                ),
            )

        val files = getTestDataFiles(false)
        mockMvc.perform(
            MockMvcRequestBuilders.multipart("/revise")
                .file(files.first)
                .file(files.second)
                .param("username", USER_NAME),
        )
            // TODO(#313) throw a more specific error exception that is mapped to a 400
            // .andExpect(status().isBadRequest)
            .andExpect(status().isInternalServerError)

        assertThat(getSequenceList().filter { it.sequenceId == DefaultFiles.firstSequence })
            .hasSize(1)
            .contains(
                SequenceVersionStatus(
                    sequenceId = DefaultFiles.firstSequence,
                    version = 1,
                    status = Status.SILO_READY,
                    isRevocation = false,
                ),
            )
    }

    private fun submitProcessedData(testData: String): ResultActions {
        return mockMvc.perform(
            MockMvcRequestBuilders.post("/submit-processed-data")
                .contentType(MediaType.APPLICATION_NDJSON_VALUE)
                .content(testData),
        )
            .andExpect(status().isOk())
    }

    private fun querySequenceList(): MvcResult {
        return mockMvc.perform(
            MockMvcRequestBuilders.get("/get-sequences-of-user")
                .param("username", USER_NAME),
        )
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andReturn()
    }

    private fun getSequenceList(): List<SequenceVersionStatus> = objectMapper.readValue<List<SequenceVersionStatus>>(
        querySequenceList().response.contentAsString,
    )

    private fun submitInitialData(): ResultActions {
        val files = getTestDataFiles(false)

        return mockMvc.perform(
            MockMvcRequestBuilders.multipart("/submit")
                .file(files.first)
                .file(files.second)
                .param("username", USER_NAME),
        )
    }

    private fun queryUnprocessedSequences(numberOfSequences: Int): MvcResult = mockMvc.perform(
        MockMvcRequestBuilders.post("/extract-unprocessed-data")
            .param("numberOfSequences", numberOfSequences.toString()),
    )
        .andExpect(status().isOk())
        .andExpect(content().contentType("application/x-ndjson"))
        .andReturn()

    private fun approveProcessedSequences(listOfSequencesToApprove: List<SequenceVersion>): ResultActions =
        mockMvc.perform(
            MockMvcRequestBuilders.post("/approve-processed-data")
                .param("username", USER_NAME)
                .contentType(MediaType.APPLICATION_JSON_VALUE)
                .content("""{"sequenceVersions":${objectMapper.writeValueAsString(listOfSequencesToApprove)}}"""),
        )
            .andExpect(status().isNoContent)

    private fun reviseSiloReadySequences(): ResultActions {
        val files = getTestDataFiles(true)

        return mockMvc.perform(
            MockMvcRequestBuilders.multipart("/revise")
                .file(files.first)
                .file(files.second)
                .param("username", USER_NAME),
        )
            .andExpect(status().isOk())
    }

    private fun getTestDataFiles(withSequenceIds: Boolean): Pair<MockMultipartFile, MockMultipartFile> {
        val metadataFile = if (withSequenceIds) DefaultFiles.revisedMetadataFile else DefaultFiles.metadataFile
        val sequencesFile = DefaultFiles.sequencesFile

        return Pair(metadataFile, sequencesFile)
    }

    private fun revokeSequences(listOfSequencesToRevoke: List<Number>) =
        objectMapper.readValue<List<SequenceVersionStatus>>(
            mockMvc.perform(
                MockMvcRequestBuilders.post("/revoke")
                    .contentType(MediaType.APPLICATION_JSON_VALUE)
                    .content("""{"sequenceIds":$listOfSequencesToRevoke}"""),
            )
                .andExpect(status().isOk())
                .andReturn().response.contentAsString,
        )

    private fun confirmRevocation(listOfSequencesToConfirm: List<Number>): ResultActions = mockMvc.perform(
        MockMvcRequestBuilders.post("/confirm-revocation")
            .contentType(MediaType.APPLICATION_JSON_VALUE)
            .content("""{"sequenceIds":$listOfSequencesToConfirm}"""),
    )
        .andExpect(status().isOk())

    private fun prepareDataToSiloReady() {
        submitInitialData()
        val rawUnprocessedData = awaitResponse(queryUnprocessedSequences(NUMBER_OF_SEQUENCES))
        submitProcessedData(dummyPreprocessing(rawUnprocessedData))
        approveProcessedSequences(DefaultFiles.allSequenceIds.map { SequenceVersion(it, 1) })
    }

    // TODO: Remove this function when all tests are migrated to the new format (with client)
    private fun dummyPreprocessing(rawUnprocessedData: String) =
        rawUnprocessedData.lines()
            .asSequence()
            .filter { it.isNotBlank() }
            .map { objectMapper.readValue<UnprocessedData>(it) }
            .map {
                PreparedProcessedData.withMetadataAndNucleotideSequence(
                    it.sequenceId,
                    metadata = objectMapper.readValue<Map<String, JsonNode>>(
                        objectMapper.writeValueAsString(it.data.metadata),
                    ),
                    it.data.unalignedNucleotideSequences,
                )
            }
            .map { objectMapper.writeValueAsString(it) }
            .joinToString("\n")

    private fun awaitResponse(result: MvcResult): String {
        await().until {
            result.response.isCommitted
        }
        return result.response.contentAsString
    }

    private fun expectLinesInResponse(result: MvcResult, numberOfSequences: Int): String {
        awaitResponse(result)

        val sequenceCount = result.response.contentAsString.count {
            it == '\n'
        }
        assertThat(sequenceCount).isEqualTo(numberOfSequences)

        return result.response.contentAsString
    }

    private fun expectStatusInResponse(result: MvcResult, numberOfSequences: Int, expectedStatus: String): String {
        awaitResponse(result)

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
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }

        @AfterAll
        @JvmStatic
        fun afterAll() {
            postgres.stop()
        }
    }
}
