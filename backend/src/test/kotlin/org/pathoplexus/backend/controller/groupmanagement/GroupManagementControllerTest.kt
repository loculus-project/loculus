package org.pathoplexus.backend.controller.groupmanagement

import org.hamcrest.CoreMatchers.hasItem
import org.hamcrest.CoreMatchers.`is`
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.pathoplexus.backend.controller.ALTERNATIVE_DEFAULT_GROUP_NAME
import org.pathoplexus.backend.controller.ALTERNATIVE_DEFAULT_USER_NAME
import org.pathoplexus.backend.controller.DEFAULT_GROUP_NAME
import org.pathoplexus.backend.controller.EndpointTest
import org.pathoplexus.backend.controller.expectUnauthorizedResponse
import org.pathoplexus.backend.controller.generateJwtFor
import org.pathoplexus.backend.controller.submission.DEFAULT_USER_NAME
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

const val NEW_GROUP = "newGroup"

@EndpointTest
class GroupManagementControllerTest(
    @Autowired private val client: GroupManagementControllerClient,
) {

    @Test
    fun `GIVEN database preparation WHEN getting groups details THEN I get the default group with the default user`() {
        client.getDetailsOfGroup(DEFAULT_GROUP_NAME)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.groupName", `is`(DEFAULT_GROUP_NAME)))
            .andExpect(jsonPath("\$.users.size()", `is`(2)))
            .andExpect(jsonPath("\$.users[*].name", hasItem(DEFAULT_USER_NAME)))
            .andExpect(jsonPath("\$.users[*].name", hasItem(ALTERNATIVE_DEFAULT_USER_NAME)))

        client.getDetailsOfGroup(ALTERNATIVE_DEFAULT_GROUP_NAME)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.groupName", `is`(ALTERNATIVE_DEFAULT_GROUP_NAME)))
            .andExpect(jsonPath("\$.users.size()", `is`(1)))
            .andExpect(jsonPath("\$.users[*].name", hasItem(DEFAULT_USER_NAME)))
    }

    @ParameterizedTest
    @MethodSource("authorizationTestCases")
    fun `GIVEN invalid authorization token WHEN performing action THEN returns 401 Unauthorized`(scenario: Scenario) {
        expectUnauthorizedResponse(isModifyingRequest = scenario.isModifying) {
            scenario.testFunction(it, client)
        }
    }

    @Test
    fun `GIVEN an existing group WHEN creating a group with same name THEN this is a bad request`() {
        client.createNewGroup().andExpect(status().isNoContent)

        client.createNewGroup().andExpect(status().isBadRequest)
    }

    @Test
    fun `GIVEN a group is created WHEN the details are queried THEN expect that the creator is the only member`() {
        client.createNewGroup()
            .andExpect(status().isNoContent)

        client.getDetailsOfGroup()
            .andExpect(status().isOk)
            .andExpect { jsonPath("\$.users.size()", `is`(1)) }
            .andExpect { jsonPath("\$.users[0].name", `is`(DEFAULT_USER_NAME)) }
    }

    @Test
    fun `WHEN I query details of a non-existing group THEN to find no group`() {
        client.getDetailsOfGroup()
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.detail").value("Group $NEW_GROUP does not exist."))
    }

    @Test
    fun `GIVEN a group is created WHEN groups of the user are queried THEN expect that the group is returned`() {
        client.createNewGroup()
            .andExpect(status().isNoContent)

        client.getGroupsOfUser()
            .andExpect(status().isOk())
            .andExpect { jsonPath("\$.size()", `is`(1)) }
            .andExpect { jsonPath("\$[0].groupName", `is`(NEW_GROUP)) }
    }

    @Test
    fun `GIVEN a group is created WHEN another user is added THEN expect user is in group`() {
        val otherUser = "otherUser"

        client.createNewGroup()
            .andExpect(status().isNoContent)

        client.addUserToGroup(otherUser)
            .andExpect(status().isNoContent)

        client.getDetailsOfGroup()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.users.size()", `is`(2)))
            .andExpect(jsonPath("\$.users[*].name", hasItem(DEFAULT_USER_NAME)))
            .andExpect(jsonPath("\$.users[*].name", hasItem(otherUser)))
    }

    @Test
    fun `GIVEN a non-member tries to remove another user THEN the action is forbidden`() {
        client.createNewGroup(jwt = generateJwtFor("otherUser"))
            .andExpect(status().isNoContent)

        client.addUserToGroup(DEFAULT_USER_NAME)
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User $DEFAULT_USER_NAME is not a member of the group $NEW_GROUP. Action not allowed.",
                ),
            )
    }

    @Test
    fun `GIVEN a non-exisiting group WHEN a user is added THEN expect to find no group`() {
        client.addUserToGroup(DEFAULT_USER_NAME)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Group $NEW_GROUP does not exist.",
                ),
            )
    }

    @Test
    fun `GIVEN a group is created WHEN a member adds themselves THEN this is a bad request`() {
        client.createNewGroup()
            .andExpect(status().isNoContent)

        client.addUserToGroup(DEFAULT_USER_NAME)
            .andExpect(status().isBadRequest)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User $DEFAULT_USER_NAME is already member of the group $NEW_GROUP.",
                ),
            )
    }

    @Test
    fun `GIVEN a group member WHEN the member is removed by another member THEN the user is not a group member`() {
        val otherUser = "otherUser"

        client.createNewGroup()
            .andExpect(status().isNoContent)

        client.addUserToGroup(otherUser)
            .andExpect(status().isNoContent)

        client.removeUserFromGroup(otherUser)
            .andExpect(status().isNoContent)

        client.getDetailsOfGroup()
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.users.size()", `is`(1)))
            .andExpect(jsonPath("\$.users[*].name", hasItem(DEFAULT_USER_NAME)))
            .andReturn()
    }

    @Test
    fun `GIVEN a non-existing group WHEN a user is removed THEN expect that the group is not found`() {
        client.removeUserFromGroup(DEFAULT_USER_NAME)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Group $NEW_GROUP " +
                        "does not exist.",
                ),
            )
            .andReturn()
    }

    @Test
    fun `GIVEN a group is created WHEN a member should be removed by a non-member THEN expect this is forbidden`() {
        client.createNewGroup(jwt = generateJwtFor("otherUser"))
            .andExpect(status().isNoContent)

        client.removeUserFromGroup(DEFAULT_USER_NAME)
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User $DEFAULT_USER_NAME is not a member of the group " +
                        "$NEW_GROUP. Action not allowed.",
                ),
            )
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
            Scenario({ jwt, client -> client.addUserToGroup(DEFAULT_USER_NAME, jwt = jwt) }, true),
            Scenario({ jwt, client -> client.removeUserFromGroup(DEFAULT_USER_NAME, jwt = jwt) }, true),
        )
    }
}
