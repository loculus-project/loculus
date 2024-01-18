package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.BeforeEach
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.testcontainers.containers.PostgreSQLContainer

@SpringBootTest
@ActiveProfiles("test-with-database")
@AutoConfigureMockMvc
class DatasetCitationsControllerTest(@Autowired val mockMvc: MockMvc, @Autowired val objectMapper: ObjectMapper) {

    private val testUsername = "testuser"

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

    private fun queryCreateAuthor(): Boolean {
        return true
    }

    private fun queryGetAuthor(): Boolean {
        return true
    }

    private fun queryUpdateAuthor(): Boolean {
        return true
    }

    private fun queryDeleteAuthor(): Boolean {
        return true
    }

    private fun queryGetAuthorCount(): Boolean {
        return true
    }

    private fun queryCreateDataset(): Boolean {
        return true
    }

    private fun queryGetDataset(): Boolean {
        return true
    }

    private fun queryUpdateDataset(): Boolean {
        return true
    }

    private fun queryDeleteDataset(): Boolean {
        return true
    }

    private fun queryGetDatasetCount(): Boolean {
        return true
    }

    private fun queryCreateCitation(): Boolean {
        return true
    }

    private fun queryGetCitation(): Boolean {
        return true
    }

    private fun queryUpdateCitation(): Boolean {
        return true
    }

    private fun queryDeleteCitation(): Boolean {
        return true
    }

    companion object {
        private val postgres: PostgreSQLContainer<*> = PostgreSQLContainer<Nothing>("postgres:latest")
            .apply {
                start()
            }
    }
}
