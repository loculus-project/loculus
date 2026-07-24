package org.loculus.backend.controller.submission

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.controller.ALTERNATIVE_DEFAULT_USER_NAME
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES
import org.loculus.backend.service.KeycloakAdapter
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class GetReviewCountsEndpointTest(
    @Autowired private val client: SubmissionControllerClient,
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val groupManagementClient: GroupManagementControllerClient,
) {
    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    @BeforeEach
    fun setup() {
        every { keycloakAdapter.getUsersWithName(any()) } returns listOf(UserRepresentation())
    }

    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse { client.getReviewCounts(jwt = it) }
    }

    @Test
    fun `GIVEN no submissions THEN returns empty list`() {
        client.getReviewCounts()
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$", hasSize<Any>(0)))
    }

    @Test
    fun `GIVEN unreleased submissions THEN returns count for the organism and group`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        convenienceClient.submitDefaultFiles(username = DEFAULT_USER_NAME, groupId = groupId)

        client.getReviewCounts()
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$", hasSize<Any>(1)))
            .andExpect(jsonPath("\$[0].organism", `is`(DEFAULT_ORGANISM)))
            .andExpect(jsonPath("\$[0].groupId", `is`(groupId)))
            .andExpect(jsonPath("\$[0].count", `is`(NUMBER_OF_SEQUENCES)))
    }

    @Test
    fun `GIVEN submissions of another group THEN a non-member does not see them`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        convenienceClient.submitDefaultFiles(username = DEFAULT_USER_NAME, groupId = groupId)

        client.getReviewCounts(jwt = generateJwtFor(ALTERNATIVE_DEFAULT_USER_NAME))
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$", hasSize<Any>(0)))
    }
}
