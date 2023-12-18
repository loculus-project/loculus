package org.pathoplexus.backend.controller.groupmanagement

import org.hamcrest.CoreMatchers.`is`
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.pathoplexus.backend.controller.expectUnauthorizedResponse
import org.pathoplexus.backend.controller.submission.DEFAULT_USER_NAME
import org.pathoplexus.backend.controller.submission.EndpointTest
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

const val DEFAULT_GROUP_NAME = "testGroup"

@EndpointTest
class GroupManagementControllerTest(
    @Autowired private val client: GroupManagementControllerClient,
) {

    @ParameterizedTest
    @MethodSource("authorizationTestCases")
    fun `GIVEN invalid authorization token WHEN performing action THEN returns 401 Unauthorized`(scenario: Scenario) {
        expectUnauthorizedResponse(isModifyingRequest = scenario.isModifying) {
            scenario.testFunction(it, client)
        }
    }

    @Test
    fun `GIVEN an existing group WHEN creating a group with same name THEN return 400`() {
        client.createNewGroup().andExpect(status().isNoContent)

        client.createNewGroup().andExpect(status().isBadRequest)
    }

    @Test
    fun `GIVEN a group is created WHEN I query the details THEN expect that the creator is the only member`() {
        client.createNewGroup()
            .andExpect(status().isNoContent)

        client.getDetailsOfGroup()
            .andExpect(status().isOk)
            .andExpect { jsonPath("\$.users.size()", `is`(1)) }
            .andExpect { jsonPath("\$.users[0].name", `is`(DEFAULT_USER_NAME)) }
            .andReturn()
    }

    @Test
    fun `WHEN I query details of a non-existing group THEN expect a 404`() {
        client.getDetailsOfGroup()
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.detail").value("Group does not exist"))
            .andReturn()
    }

    @Test
    fun `GIVEN WHEN I query details of a non-existing group THEN expect a 404`() {
        client.getDetailsOfGroup()
            .andExpect(status().isNotFound())
            .andReturn()
    }

    @Test
    fun `GIVEN a group is created WHEN I query the groups of the user THEN expect that the group is returned`() {
        client.createNewGroup()
            .andExpect(status().isNoContent())

        client.getGroupsOfUser()
            .andExpect(status().isOk())
            .andExpect { jsonPath("\$.size()", `is`(1)) }
            .andExpect { jsonPath("\$[0].groupName", `is`(DEFAULT_GROUP_NAME)) }
            .andReturn()
    }

    companion object {
        data class Scenario(
            val testFunction: (String?, GroupManagementControllerClient) -> ResultActions,
            val isModifying: Boolean,
        )

        @JvmStatic
        fun authorizationTestCases(): List<Scenario> = listOf(
            Scenario({ jwt, client -> client.createNewGroup(jwt = jwt) }, true),
            Scenario({ jwt, client -> client.getDetailsOfGroup(jwt = jwt) }, false),
            Scenario({ jwt, client -> client.getGroupsOfUser(jwt = jwt) }, false),
        )
    }
}
