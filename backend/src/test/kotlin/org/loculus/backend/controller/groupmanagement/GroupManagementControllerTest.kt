package org.loculus.backend.controller.groupmanagement

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.CoreMatchers.hasItem
import org.hamcrest.CoreMatchers.`is`
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.api.Address
import org.loculus.backend.api.Group
import org.loculus.backend.controller.ALTERNATIVE_DEFAULT_GROUP
import org.loculus.backend.controller.ALTERNATIVE_DEFAULT_GROUP_NAME
import org.loculus.backend.controller.ALTERNATIVE_DEFAULT_USER_NAME
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.DEFAULT_GROUP_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.submission.DEFAULT_USER_NAME
import org.loculus.backend.service.KeycloakAdapter
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

const val NEW_GROUP_NAME = "newGroup"
val NEW_GROUP = Group(
    groupName = NEW_GROUP_NAME,
    institution = "newInstitution",
    address = Address(
        line1 = "newAddressLine1",
        line2 = "newAddressLine2",
        city = "newCity",
        state = "newState",
        postalCode = "newPostalCode",
        country = "newCountry",
    ),
    contactEmail = "newEmail",
)

@EndpointTest
class GroupManagementControllerTest(
    @Autowired private val client: GroupManagementControllerClient,
) {
    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    @BeforeEach
    fun setup() {
        every { keycloakAdapter.getUsersWithName(any()) } returns listOf(UserRepresentation())
    }

    @Test
    fun `GIVEN database preparation WHEN getting groups details THEN I get the default group with the default user`() {
        client.getDetailsOfGroup(DEFAULT_GROUP)
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

        client.getDetailsOfGroup(ALTERNATIVE_DEFAULT_GROUP)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.group.groupName").value(ALTERNATIVE_DEFAULT_GROUP_NAME))
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

        client.createNewGroup().andExpect(status().isConflict)
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
    fun `WHEN I query details of a non-existing group THEN expect error that group does not exist`() {
        client.getDetailsOfGroup()
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.detail").value("Group ${NEW_GROUP.groupName} does not exist."))
    }

    @Test
    fun `GIVEN a group is created WHEN groups of the user are queried THEN expect that the group is returned`() {
        client.createNewGroup()
            .andExpect(status().isNoContent)

        client.getGroupsOfUser()
            .andExpect(status().isOk())
            .andExpect { jsonPath("\$.size()", `is`(1)) }
            .andExpect { jsonPath("\$[0].groupName", `is`(NEW_GROUP.groupName)) }
            .andExpect { jsonPath("\$[0].institution", `is`(NEW_GROUP.institution)) }
            .andExpect { jsonPath("\$[0].address", `is`(NEW_GROUP.address)) }
            .andExpect { jsonPath("\$[0].contactEmail", `is`(NEW_GROUP.contactEmail)) }
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

        client.createNewGroup()
            .andExpect(status().isNoContent)

        client.addUserToGroup(otherUser)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User $otherUser does not exist.",
                ),
            )
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
        client.createNewGroup(jwt = generateJwtFor(ALTERNATIVE_DEFAULT_USER_NAME))
            .andExpect(status().isNoContent)

        client.addUserToGroup(DEFAULT_USER_NAME)
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User $DEFAULT_USER_NAME is not a member of group(s) ${NEW_GROUP.groupName}. Action not allowed.",
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
                    "Group(s) ${NEW_GROUP.groupName} do not exist.",
                ),
            )
    }

    @Test
    fun `GIVEN a group is created WHEN a member adds themselves THEN this is a bad request`() {
        client.createNewGroup()
            .andExpect(status().isNoContent)

        client.addUserToGroup(DEFAULT_USER_NAME)
            .andExpect(status().isConflict)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User $DEFAULT_USER_NAME is already member of the group ${NEW_GROUP.groupName}.",
                ),
            )
    }

    @Test
    fun `GIVEN a group member WHEN the member is removed by another member THEN the user is not a group member`() {
        client.createNewGroup()
            .andExpect(status().isNoContent)

        client.addUserToGroup(ALTERNATIVE_DEFAULT_USER_NAME)
            .andExpect(status().isNoContent)

        client.removeUserFromGroup(ALTERNATIVE_DEFAULT_USER_NAME)
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
                    "Group(s) ${NEW_GROUP.groupName} do not exist.",
                ),
            )
            .andReturn()
    }

    @Test
    fun `GIVEN a group is created WHEN a member should be removed by a non-member THEN expect this is forbidden`() {
        client.createNewGroup(jwt = generateJwtFor(ALTERNATIVE_DEFAULT_USER_NAME))
            .andExpect(status().isNoContent)

        client.removeUserFromGroup(DEFAULT_USER_NAME)
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User $DEFAULT_USER_NAME is not a member of group(s) " +
                        "${NEW_GROUP.groupName}. Action not allowed.",
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
