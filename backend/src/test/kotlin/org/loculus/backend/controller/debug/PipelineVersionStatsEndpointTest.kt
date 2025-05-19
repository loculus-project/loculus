package org.loculus.backend.controller.debug

import com.jayway.jsonpath.JsonPath
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.jwtForSuperUser
import org.loculus.backend.controller.submission.PreparedProcessedData
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest(properties = ["${BackendSpringProperty.DEBUG_MODE}=true"])
class PipelineVersionStatsEndpointTest(
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse { getStats(jwt = it) }
    }

    @Test
    fun `WHEN non-superuser calls endpoint THEN is forbidden`() {
        getStats(jwtForDefaultUser)
            .andExpect(status().isForbidden)
    }

    @Test
    fun `WHEN sequences are processed THEN stats are returned`() {
        convenienceClient.prepareDataTo(status = org.loculus.backend.api.Status.PROCESSED)
        val otherAccessions = convenienceClient.submitDefaultFiles(organism = OTHER_ORGANISM)
        val unprocessed = convenienceClient.extractUnprocessedData(
            numberOfSequenceEntries = DefaultFiles.NUMBER_OF_SEQUENCES,
            organism = OTHER_ORGANISM,
            pipelineVersion = 2,
        )
        val processed = unprocessed.map {
            PreparedProcessedData.successfullyProcessed(accession = it.accession, version = it.version)
        }
        convenienceClient.submitProcessedData(processed, organism = OTHER_ORGANISM, pipelineVersion = 2)

        val result = getStats(jwtForSuperUser)
            .andExpect(status().isOk)
            .andReturn()

        val json: Map<String, Map<String, Int>> = JsonPath.read(result.response.contentAsString)
        assertThat(json[DEFAULT_ORGANISM]?.get("1"), `is`(DefaultFiles.NUMBER_OF_SEQUENCES))
        assertThat(json[OTHER_ORGANISM]?.get("2"), `is`(DefaultFiles.NUMBER_OF_SEQUENCES))
    }

    private fun getStats(jwt: String?) = mockMvc.perform(
        get("/debug/pipeline-version-stats").withAuth(jwt),
    )
}

@EndpointTest
class PipelineVersionStatsEndpointWithDebugModeOffTest(@Autowired private val mockMvc: MockMvc) {
    @Test
    fun `GIVEN debug mode is off THEN endpoint is not present`() {
        mockMvc.perform(get("/debug/pipeline-version-stats").withAuth(jwtForSuperUser))
            .andExpect(status().isNotFound)
    }
}
