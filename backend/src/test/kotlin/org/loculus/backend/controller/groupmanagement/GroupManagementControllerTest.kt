package org.loculus.backend.controller.groupmanagement

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.CoreMatchers.hasItem
import org.hamcrest.CoreMatchers.hasItems
import org.hamcrest.CoreMatchers.`is`
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.controller.ALTERNATIVE_DEFAULT_GROUP
import org.loculus.backend.controller.ALTERNATIVE_DEFAULT_GROUP_NAME
import org.loculus.backend.controller.ALTERNATIVE_DEFAULT_USER_NAME
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.DEFAULT_GROUP_CHANGED
import org.loculus.backend.controller.DEFAULT_GROUP_NAME
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.jwtForAlternativeUser
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.jwtForSuperUser
import org.loculus.backend.service.KeycloakAdapter
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.util.UUID

@EndpointTest
class GroupManagementControllerTest(@Autowired private val client: GroupManagementControllerClient) {
    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    @BeforeEach
    fun setup() {
        every { keycloakAdapter.getUsersWithName(any()) } returns listOf(UserRepresentation())
    }

    @Test
    fun `GIVEN database preparation WHEN getting groups details THEN I get the default group with the default user`() {
        val defaultGroupId = client.createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)
            .andGetGroupId()

        client.addUserToGroup(
            groupId = defaultGroupId,
            usernameToAdd = ALTERNATIVE_DEFAULT_USER_NAME,
            jwt = jwtForDefaultUser,
        )
            .andExpect(status().isNoContent)

        val alternativeGroupId = client.createNewGroup(group = ALTERNATIVE_DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)
            .andGetGroupId()

        client.getDetailsOfGroup(defaultGroupId)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.group.groupName").value(DEFAULT_GROUP_NAME))
            .andExpect(jsonPath("\$.group.institution").value(DEFAULT_GROUP.institution))
            .andExpect(jsonPath("\$.group.address.line1").value(DEFAULT_GROUP.address.line1))
            .andExpect(jsonPath("\$.group.address.line2").value(DEFAULT_GROUP.address.line2))
            .andExpect(jsonPath("\$.group.address.city").value(DEFAULT_GROUP.address.city))
            .andExpect(jsonPath("\$.group.address.state").value(DEFAULT_GROUP.address.state))
            .andExpect(jsonPath("\$.group.address.postalCode").value(DEFAULT_GROUP.address.postalCode))
            .andExpect(jsonPath("\$.group.address.country").value(DEFAULT_GROUP.address.country))
            .andExpect(jsonPath("\$.group.contactEmail").value(DEFAULT_GROUP.contactEmail))
            .andExpect(jsonPath("\$.users.size()", `is`(2)))
            .andExpect(jsonPath("\$.users[*].name", hasItem(DEFAULT_USER_NAME)))
            .andExpect(jsonPath("\$.users[*].name", hasItem(ALTERNATIVE_DEFAULT_USER_NAME)))

        client.getDetailsOfGroup(alternativeGroupId)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.group.groupName").value(ALTERNATIVE_DEFAULT_GROUP_NAME))
            .andExpect(jsonPath("\$.users.size()", `is`(1)))
            .andExpect(jsonPath("\$.users[*].name", hasItem(DEFAULT_USER_NAME)))
    }

    @Test
    fun `GIVEN I am not authenticated WHEN I query a group THEN returns public details only`() {
        val defaultGroupId = client.createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)
            .andGetGroupId()

        client.getDetailsOfGroup(defaultGroupId, jwt = null)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.group.groupName").value(DEFAULT_GROUP_NAME))
            .andExpect(jsonPath("\$.group.institution").value(DEFAULT_GROUP.institution))
            .andExpect(jsonPath("\$.group.address.line1").value(DEFAULT_GROUP.address.line1))
            .andExpect(jsonPath("\$.group.address.line2").value(DEFAULT_GROUP.address.line2))
            .andExpect(jsonPath("\$.group.address.city").value(DEFAULT_GROUP.address.city))
            .andExpect(jsonPath("\$.group.address.state").value(DEFAULT_GROUP.address.state))
            .andExpect(jsonPath("\$.group.address.postalCode").value(DEFAULT_GROUP.address.postalCode))
            .andExpect(jsonPath("\$.group.address.country").value(DEFAULT_GROUP.address.country))
            .andExpect(jsonPath("\$.group.contactEmail").isEmpty())
            .andExpect(jsonPath("\$.users").isEmpty())
    }

    @Test
    fun `GIVEN I created a group WHEN I query my groups THEN returns created group`() {
        val jwtForAnotherUser = generateJwtFor(UUID.randomUUID().toString() + "testuser")

        client.createNewGroup(group = NEW_GROUP, jwt = jwtForAnotherUser)
            .andExpect(status().isOk)

        client.getGroupsOfUser(jwt = jwtForAnotherUser)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.size()", `is`(1)))
            .andExpect(jsonPath("\$.[0].groupName").value(NEW_GROUP.groupName))
            .andExpect(jsonPath("\$.[0].institution").value(NEW_GROUP.institution))
            .andExpect(jsonPath("\$.[0].address.line1").value(NEW_GROUP.address.line1))
            .andExpect(jsonPath("\$.[0].address.line2").value(NEW_GROUP.address.line2))
            .andExpect(jsonPath("\$.[0].address.city").value(NEW_GROUP.address.city))
            .andExpect(jsonPath("\$.[0].address.state").value(NEW_GROUP.address.state))
            .andExpect(jsonPath("\$.[0].address.postalCode").value(NEW_GROUP.address.postalCode))
            .andExpect(jsonPath("\$.[0].address.country").value(NEW_GROUP.address.country))
            .andExpect(jsonPath("\$.[0].contactEmail").value(NEW_GROUP.contactEmail))
    }

    @Test
    fun `GIVEN I'm a member of a group WHEN I edit the group THEN the group information is updated`() {
        val groupId = client.createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)
            .andGetGroupId()

        client.updateGroup(
            groupId = groupId,
            group = DEFAULT_GROUP_CHANGED,
            jwt = jwtForDefaultUser,
        ).verifyGroupInfo("\$", DEFAULT_GROUP_CHANGED)

        client.getDetailsOfGroup(groupId = groupId, jwt = jwtForDefaultUser)
            .verifyGroupInfo("\$.group", DEFAULT_GROUP_CHANGED)
    }

    @Test
    fun `GIVEN I'm a superuser WHEN I edit the group THEN the group information is updated`() {
        val groupId = client.createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)
            .andGetGroupId()

        client.updateGroup(
            groupId = groupId,
            group = DEFAULT_GROUP_CHANGED,
            jwt = jwtForSuperUser,
        )
            .verifyGroupInfo("\$", DEFAULT_GROUP_CHANGED)

        client.getDetailsOfGroup(groupId = groupId, jwt = jwtForSuperUser)
            .verifyGroupInfo("\$.group", DEFAULT_GROUP_CHANGED)
    }

    @Test
    fun `GIVEN I'm not a member of a group WHEN I edit the group THEN I am not authorized`() {
        val groupId = client.createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)
            .andGetGroupId()

        val updateGroupResult = client.updateGroup(
            groupId = groupId,
            group = DEFAULT_GROUP_CHANGED,
            jwt = jwtForAlternativeUser,
        )
        updateGroupResult.andExpect(status().isForbidden)

        client.getDetailsOfGroup(groupId = groupId, jwt = jwtForDefaultUser)
            .verifyGroupInfo("\$.group", DEFAULT_GROUP)
    }

    @Test
    fun `WHEN superuser queries groups of user THEN returns all groups`() {
        client.createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)
        client.createNewGroup(group = ALTERNATIVE_DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)

        client.getGroupsOfUser(jwt = jwtForSuperUser)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath(
                    "\$.[*].groupName",
                    hasItems(DEFAULT_GROUP_NAME, ALTERNATIVE_DEFAULT_GROUP_NAME),
                ),
            )
    }

    @ParameterizedTest
    @MethodSource("authorizationTestCases")
    fun `GIVEN invalid authorization token WHEN performing action THEN returns 401 Unauthorized`(scenario: Scenario) {
        expectUnauthorizedResponse(isModifyingRequest = scenario.isModifying) {
            scenario.testFunction(it, client)
        }
    }

    @Test
    fun `GIVEN a group is created WHEN the details are queried THEN expect that the creator is the only member`() {
        val groupId = client.createNewGroup()
            .andExpect(status().isOk)
            .andGetGroupId()

        client.getDetailsOfGroup(groupId)
            .andExpect(status().isOk)
            .andExpect { jsonPath("\$.users.size()", `is`(1)) }
            .andExpect { jsonPath("\$.users[0].name", `is`(DEFAULT_USER_NAME)) }
    }

    @Test
    fun `WHEN I query details of a non-existing group THEN expect error that group does not exist`() {
        client.getDetailsOfGroup(groupId = 123456789)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("\$.detail").value("Group 123456789 does not exist."))
    }

    @Test
    fun `GIVEN a group is created WHEN all groups are queried THEN expect that the group is returned`() {
        client.createNewGroup()
            .andExpect(status().isOk)

        client.getAllGroups()
            .andExpect(status().isOk())
            .andExpect { jsonPath("\$.size()", `is`(1)) }
            .andExpect { jsonPath("\$[0].groupName", `is`(NEW_GROUP.groupName)) }
            .andExpect { jsonPath("\$[0].institution", `is`(NEW_GROUP.institution)) }
            .andExpect { jsonPath("\$[0].address", `is`(NEW_GROUP.address)) }
            .andExpect { jsonPath("\$[0].contactEmail", `is`(NEW_GROUP.contactEmail)) }
    }

    @Test
    fun `GIVEN groups are created WHEN group is queried by name THEN expect that exactly one group is returned`() {
        client.createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)
        client.createNewGroup(group = ALTERNATIVE_DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)

        client.getGroupsFilterByName(name = DEFAULT_GROUP_NAME, jwt = jwtForDefaultUser)
            .andExpect(status().isOk())
            .andExpect { jsonPath("\$.size()", `is`(1)) }
            // filtering should be case-insensitive
            .andExpect { jsonPath("\$[0].groupName", `is`(DEFAULT_GROUP_NAME.lowercase())) }
    }

    @Test
    fun `WHEN creating a group with invalid fields THEN expect error`() {
        client.createNewGroupWithBody("{}")
            .andExpect(status().isBadRequest)
            .andExpect { jsonPath("\$.detail", containsString("value failed for JSON property groupName")) }
    }

    @Test
    fun `GIVEN a group WHEN I add a user that does not exists to the group THEN expect user is not found`() {
        every { keycloakAdapter.getUsersWithName(any()) } returns listOf()

        val otherUser = "otherUserThatDoesNotExist"

        val groupId = client.createNewGroup()
            .andExpect(status().isOk)
            .andGetGroupId()

        client.addUserToGroup(groupId = groupId, usernameToAdd = otherUser)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User $otherUser does not exist.",
                ),
            )
    }

    @Test
    fun `GIVEN a group is created WHEN another user is added THEN expect user is in group`() {
        val otherUser = "otherUser"

        val groupId = client.createNewGroup()
            .andExpect(status().isOk)
            .andGetGroupId()

        client.addUserToGroup(groupId = groupId, usernameToAdd = otherUser)
            .andExpect(status().isNoContent)

        client.getDetailsOfGroup(groupId = groupId)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.users.size()", `is`(2)))
            .andExpect(jsonPath("\$.users[*].name", hasItem(DEFAULT_USER_NAME)))
            .andExpect(jsonPath("\$.users[*].name", hasItem(otherUser)))
    }

    @Test
    fun `WHEN a non-member tries to remove another user THEN the action is forbidden`() {
        val groupId = client.createNewGroup(jwt = generateJwtFor(ALTERNATIVE_DEFAULT_USER_NAME))
            .andExpect(status().isOk)
            .andGetGroupId()

        client.removeUserFromGroup(
            groupId = groupId,
            userToRemove = ALTERNATIVE_DEFAULT_USER_NAME,
            jwt = jwtForDefaultUser,
        )
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User $DEFAULT_USER_NAME is not a member of group(s) $groupId. Action not allowed.",
                ),
            )
    }

    @Test
    fun `WHEN a non-member tries to add another user THEN the action is forbidden`() {
        val groupId = client.createNewGroup(jwt = generateJwtFor(ALTERNATIVE_DEFAULT_USER_NAME))
            .andExpect(status().isOk)
            .andGetGroupId()

        client.addUserToGroup(groupId = groupId, usernameToAdd = DEFAULT_USER_NAME, jwt = jwtForDefaultUser)
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User $DEFAULT_USER_NAME is not a member of group(s) $groupId. Action not allowed.",
                ),
            )
    }

    @Test
    fun `WHEN a superusers removes a user from a group THEN user is removed`() {
        val groupId = client.createNewGroup()
            .andExpect(status().isOk)
            .andGetGroupId()

        client.removeUserFromGroup(groupId = groupId, userToRemove = DEFAULT_USER_NAME, jwt = jwtForSuperUser)
            .andExpect(status().isNoContent)

        client.getDetailsOfGroup(groupId = groupId)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.users.size()", `is`(0)))
    }

    @Test
    fun `WHEN a superusers adds a user to a group THEN user is added`() {
        val groupId = client.createNewGroup().andExpect(status().isOk).andGetGroupId()

        client.addUserToGroup(groupId = groupId, usernameToAdd = "another user", jwt = jwtForSuperUser)
            .andExpect(status().isNoContent)

        client.getDetailsOfGroup(groupId)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.users.size()", `is`(2)))
    }

    @Test
    fun `GIVEN a non-existing group WHEN a user is added THEN expect to find no group`() {
        val groupId = 123456789

        client.addUserToGroup(groupId = groupId, usernameToAdd = DEFAULT_USER_NAME)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Group(s) $groupId do(es) not exist.",
                ),
            )
    }

    @Test
    fun `GIVEN a group is created WHEN a member adds themselves THEN this is a bad request`() {
        val groupId = client.createNewGroup()
            .andExpect(status().isOk)
            .andGetGroupId()

        client.addUserToGroup(groupId = groupId, usernameToAdd = DEFAULT_USER_NAME)
            .andExpect(status().isConflict)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User $DEFAULT_USER_NAME is already member of the group $groupId.",
                ),
            )
    }

    @Test
    fun `GIVEN a group member WHEN the member is removed by another member THEN the user is not a group member`() {
        val groupId = client.createNewGroup()
            .andExpect(status().isOk)
            .andGetGroupId()

        client.addUserToGroup(groupId = groupId, usernameToAdd = ALTERNATIVE_DEFAULT_USER_NAME)
            .andExpect(status().isNoContent)

        client.removeUserFromGroup(groupId = groupId, userToRemove = ALTERNATIVE_DEFAULT_USER_NAME)
            .andExpect(status().isNoContent)

        client.getDetailsOfGroup(groupId)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.users.size()", `is`(1)))
            .andExpect(jsonPath("\$.users[*].name", hasItem(DEFAULT_USER_NAME)))
            .andReturn()
    }

    @Test
    fun `GIVEN a non-existing group WHEN a user is removed THEN expect that the group is not found`() {
        val groupId = 123456789

        client.removeUserFromGroup(groupId = groupId, userToRemove = DEFAULT_USER_NAME)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Group(s) $groupId do(es) not exist.",
                ),
            )
            .andReturn()
    }

    @Test
    fun `GIVEN a group is created WHEN a member should be removed by a non-member THEN expect this is forbidden`() {
        val groupId = client.createNewGroup(jwt = generateJwtFor(ALTERNATIVE_DEFAULT_USER_NAME))
            .andExpect(status().isOk)
            .andGetGroupId()

        client.removeUserFromGroup(groupId = groupId, userToRemove = DEFAULT_USER_NAME)
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User $DEFAULT_USER_NAME is not a member of group(s) " +
                        "$groupId. Action not allowed.",
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
            Scenario({ jwt, client -> client.createNewGroup(jwt = jwt) }, isModifying = true),
            Scenario({ jwt, client -> client.getGroupsOfUser(jwt = jwt) }, isModifying = false),
            Scenario({ jwt, client -> client.getAllGroups(jwt = jwt) }, isModifying = false),
            Scenario(
                { jwt, client -> client.addUserToGroup(groupId = 123, usernameToAdd = DEFAULT_USER_NAME, jwt = jwt) },
                isModifying = true,
            ),
            Scenario(
                { jwt, client ->
                    client.removeUserFromGroup(
                        groupId = 123,
                        userToRemove = DEFAULT_USER_NAME,
                        jwt = jwt,
                    )
                },
                isModifying = true,
            ),
        )
    }
}
