package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.BeforeEach
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.MvcResult
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.containers.PostgreSQLContainer

@SpringBootTest
@ActiveProfiles("test-with-database")
@AutoConfigureMockMvc
class CitationControllerTest(@Autowired val mockMvc: MockMvc, @Autowired val objectMapper: ObjectMapper) {

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

    private fun queryPostCreateAuthor(): Boolean { return true }
    private fun queryGetReadAuthor(): Boolean { return true }
    private fun queryPatchUpdateAuthor(): Boolean { return true }
    private fun queryDeleteAuthor(): Boolean { return true }
    private fun queryGetAuthorCount(): Boolean { return true }

    private fun queryGetBibliographyCount(): Boolean { return true }
    private fun queryGetCitationCount(): Boolean { return true }

    companion object {
        private val postgres: PostgreSQLContainer<*> = PostgreSQLContainer<Nothing>("postgres:latest")
            .apply {
                start()
            }
    }
}
