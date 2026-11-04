package org.loculus.backend.api.v1.groups

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.jayway.jsonpath.JsonPath
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.CoreMatchers.hasItem
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.CoreMatchers.not
import org.hamcrest.CoreMatchers.nullValue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.service.KeycloakAdapter
import org.loculus.backend.testutil.ALTERNATIVE_DEFAULT_USER_NAME
import org.loculus.backend.testutil.DEFAULT_USER_NAME
import org.loculus.backend.testutil.EndpointTest
import org.loculus.backend.testutil.expectUnauthorizedResponse
import org.loculus.backend.testutil.jwtForAlternativeUser
import org.loculus.backend.testutil.jwtForDefaultUser
import org.loculus.backend.types.MAX_GROUP_FIELD_LENGTH
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

private const val NON_EXISTENT_GROUP_ID = 123456789
private const val NON_EXISTENT_USER_NAME = "nonExistentUser"

@EndpointTest
@Import(GroupsControllerClient::class)
class GroupsControllerTest(@Autowired private val client: GroupsControllerClient) {
    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    @BeforeEach
    fun setup() {
        every { keycloakAdapter.getUsersWithName(any()) } answers {
            listOf(UserRepresentation().apply { username = firstArg<String>().lowercase() })
        }
        every { keycloakAdapter.getUsersWithName(NON_EXISTENT_USER_NAME) } returns emptyList()
    }

    @ParameterizedTest
    @MethodSource("endpointsWithGroupId")
    fun `WHEN the group ID is not an integer THEN returns 400`(scenario: Scenario) {
        scenario.call(client, "notAnInteger", jwtForDefaultUser)
            .andExpect(status().isBadRequest)
    }

    @ParameterizedTest
    @MethodSource("endpointsRequiringAuthentication")
    fun `WHEN no token or an invalid token is sent THEN returns 401`(scenario: Scenario) {
        expectUnauthorizedResponse { jwt -> scenario.call(client, NON_EXISTENT_GROUP_ID, jwt) }
    }

    @ParameterizedTest
    @MethodSource("endpointsRequiringMembership")
    fun `GIVEN a group WHEN a non-member calls an endpoint requiring membership THEN returns 403`(scenario: Scenario) {
        val groupId = client.createGroup().andGetGroupId()

        scenario.call(client, groupId, jwtForAlternativeUser)
            .andExpect(status().isForbidden)
            .andExpect(
                jsonPath("\$.detail").value(
                    "User $ALTERNATIVE_DEFAULT_USER_NAME is not a member of group(s) $groupId. Action not allowed.",
                ),
            )
    }

    @ParameterizedTest
    @MethodSource("endpointsWithGroupId")
    fun `WHEN the group does not exist THEN returns 404`(scenario: Scenario) {
        scenario.call(client, NON_EXISTENT_GROUP_ID, jwtForDefaultUser)
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("\$.detail").value("Group $NON_EXISTENT_GROUP_ID does not exist."))
    }

    @ParameterizedTest
    @MethodSource("endpointsWithRequestBody")
    fun `WHEN the request body is missing a field THEN returns 400`(scenario: BodyScenario) {
        val groupId = client.createGroup().andGetGroupId()

        scenario.call(client, groupId, """{"groupName": "missingFields"}""", MediaType.APPLICATION_JSON_VALUE)
            .andExpect(status().isBadRequest)
    }

    @ParameterizedTest
    @MethodSource("endpointsWithRequestBody")
    fun `WHEN the request body is not JSON THEN returns 415`(scenario: BodyScenario) {
        val groupId = client.createGroup().andGetGroupId()

        scenario.call(client, groupId, "not json", MediaType.TEXT_PLAIN_VALUE)
            .andExpect(status().isUnsupportedMediaType)
    }

    @ParameterizedTest
    @MethodSource("endpointsWithRequestBody")
    fun `WHEN a request body field is too long THEN returns 422`(scenario: BodyScenario) {
        val groupId = client.createGroup().andGetGroupId()
        val tooLongGroup = V1_NEW_GROUP.copy(groupName = "a".repeat(MAX_GROUP_FIELD_LENGTH + 1))

        scenario.call(
            client,
            groupId,
            jacksonObjectMapper().writeValueAsString(tooLongGroup),
            MediaType.APPLICATION_JSON_VALUE,
        )
            .andExpect(status().isUnprocessableContent)
    }

    @Test
    fun `WHEN creating a group THEN returns 201 with the created group and its location`() {
        val result = client.createGroup()
            .andExpect(status().isCreated)
            .andExpect(jsonPath("\$.groupName").value(V1_NEW_GROUP.groupName))
            .andExpect(jsonPath("\$.address.city").value(V1_NEW_GROUP.address.city))
            .andExpect(jsonPath("\$.contactEmail").value(V1_NEW_GROUP.contactEmail))
        val groupId = result.andGetGroupId()

        result.andExpect(header().string("Location", "/v1/groups/$groupId"))
    }

    @Test
    fun `GIVEN a group WHEN updating it THEN returns the updated group`() {
        val groupId = client.createGroup().andGetGroupId()
        val updated = V1_NEW_GROUP.copy(groupName = "updatedGroup")

        client.updateGroup(groupId, updated)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.groupId").value(groupId))
            .andExpect(jsonPath("\$.groupName").value("updatedGroup"))
    }

    @Test
    fun `GIVEN a group WHEN getting it without a token THEN the contact email is hidden`() {
        val groupId = client.createGroup().andGetGroupId()

        client.getGroupDetails(groupId, jwt = null)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.groupId").value(groupId))
            .andExpect(jsonPath("\$.groupName").value(V1_NEW_GROUP.groupName))
            .andExpect(jsonPath("\$.contactEmail", `is`(nullValue())))
    }

    @Test
    fun `GIVEN a group WHEN getting it with a token THEN the contact email is included`() {
        val groupId = client.createGroup().andGetGroupId()

        client.getGroupDetails(groupId)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.contactEmail").value(V1_NEW_GROUP.contactEmail))
    }

    @Test
    fun `GIVEN a group WHEN getting it with an invalid token THEN returns 401`() {
        val groupId = client.createGroup().andGetGroupId()

        client.getGroupDetails(groupId, jwt = "invalidToken")
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `GIVEN a group WHEN getting its users THEN returns their usernames`() {
        val groupId = client.createGroup().andGetGroupId()

        client.getGroupUsers(groupId)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.size()", `is`(1)))
            .andExpect(jsonPath("\$[0].username").value(DEFAULT_USER_NAME))
    }

    @Test
    fun `GIVEN a group created by another user WHEN getting my groups THEN it is not included`() {
        val ownGroupId = client.createGroup().andGetGroupId()
        val otherGroupId = client.createGroup(jwt = jwtForAlternativeUser).andGetGroupId()

        client.getUserGroups()
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$[*].groupId", hasItem(ownGroupId)))
            .andExpect(jsonPath("\$[*].groupId", not(hasItem(otherGroupId))))
    }

    @Test
    fun `GIVEN groups WHEN listing them filtered by name THEN returns only matching groups`() {
        client.createGroup()
        client.createGroup(V1_NEW_GROUP.copy(groupName = "otherGroup"))

        client.getGroups(name = V1_NEW_GROUP.groupName.uppercase())
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.size()", `is`(1)))
            .andExpect(jsonPath("\$[0].groupName").value(V1_NEW_GROUP.groupName))
    }

    @Test
    fun `GIVEN a group WHEN adding and then removing a user THEN the users reflect each change`() {
        val groupId = client.createGroup().andGetGroupId()

        client.addUserToGroup(groupId, ALTERNATIVE_DEFAULT_USER_NAME)
            .andExpect(status().isNoContent)
        client.getGroupUsers(groupId)
            .andExpect(jsonPath("\$[*].username", hasItem(ALTERNATIVE_DEFAULT_USER_NAME)))

        client.removeUserFromGroup(groupId, ALTERNATIVE_DEFAULT_USER_NAME)
            .andExpect(status().isNoContent)
        client.getGroupUsers(groupId)
            .andExpect(jsonPath("\$[*].username", not(hasItem(ALTERNATIVE_DEFAULT_USER_NAME))))
    }

    @Test
    fun `GIVEN a user already in the group WHEN adding them again THEN returns 409`() {
        val groupId = client.createGroup().andGetGroupId()

        client.addUserToGroup(groupId, DEFAULT_USER_NAME)
            .andExpect(status().isConflict)
    }

    @Test
    fun `GIVEN a group WHEN adding a user that does not exist THEN returns 404`() {
        val groupId = client.createGroup().andGetGroupId()

        client.addUserToGroup(groupId, NON_EXISTENT_USER_NAME)
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("\$.detail").value("User $NON_EXISTENT_USER_NAME does not exist."))
    }

    @Test
    fun `GIVEN a user not in the group WHEN removing them THEN returns 204`() {
        val groupId = client.createGroup().andGetGroupId()

        client.removeUserFromGroup(groupId, ALTERNATIVE_DEFAULT_USER_NAME)
            .andExpect(status().isNoContent)
    }

    @Test
    fun `GIVEN a user in the group WHEN removing them with a different case THEN they are removed`() {
        val groupId = client.createGroup().andGetGroupId()
        client.addUserToGroup(groupId, ALTERNATIVE_DEFAULT_USER_NAME)

        client.removeUserFromGroup(groupId, ALTERNATIVE_DEFAULT_USER_NAME.uppercase())
            .andExpect(status().isNoContent)
        client.getGroupUsers(groupId)
            .andExpect(jsonPath("\$[*].username", not(hasItem(ALTERNATIVE_DEFAULT_USER_NAME))))
    }

    private fun ResultActions.andGetGroupId(): Int = JsonPath.read(andReturn().response.contentAsString, "\$.groupId")

    companion object {
        data class Scenario(
            val name: String,
            val call: (client: GroupsControllerClient, groupId: Any, jwt: String?) -> ResultActions,
        ) {
            override fun toString() = name
        }

        data class BodyScenario(
            val name: String,
            val call: (
                client: GroupsControllerClient,
                groupId: Int,
                body: String,
                contentType: String,
            ) -> ResultActions,
        ) {
            override fun toString() = name
        }

        private val createGroup = Scenario("createGroup") { client, _, jwt -> client.createGroup(jwt = jwt) }
        private val updateGroup = Scenario("updateGroup") { client, groupId, jwt ->
            client.updateGroup(groupId, jwt = jwt)
        }
        private val getGroupDetails = Scenario("getGroupDetails") { client, groupId, jwt ->
            client.getGroupDetails(groupId, jwt = jwt)
        }
        private val getGroupUsers = Scenario("getGroupUsers") { client, groupId, jwt ->
            client.getGroupUsers(groupId, jwt = jwt)
        }
        private val getUserGroups = Scenario("getUserGroups") { client, _, jwt -> client.getUserGroups(jwt = jwt) }
        private val getGroups = Scenario("getGroups") { client, _, jwt -> client.getGroups(jwt = jwt) }
        private val addUserToGroup = Scenario("addUserToGroup") { client, groupId, jwt ->
            client.addUserToGroup(groupId, ALTERNATIVE_DEFAULT_USER_NAME, jwt = jwt)
        }
        private val removeUserFromGroup = Scenario("removeUserFromGroup") { client, groupId, jwt ->
            client.removeUserFromGroup(groupId, DEFAULT_USER_NAME, jwt = jwt)
        }

        @JvmStatic
        fun endpointsWithGroupId(): List<Scenario> =
            listOf(updateGroup, getGroupDetails, getGroupUsers, addUserToGroup, removeUserFromGroup)

        @JvmStatic
        fun endpointsRequiringAuthentication(): List<Scenario> = listOf(
            createGroup,
            updateGroup,
            getGroupUsers,
            getUserGroups,
            getGroups,
            addUserToGroup,
            removeUserFromGroup,
        )

        @JvmStatic
        fun endpointsRequiringMembership(): List<Scenario> = listOf(updateGroup, addUserToGroup, removeUserFromGroup)

        @JvmStatic
        fun endpointsWithRequestBody(): List<BodyScenario> = listOf(
            BodyScenario("createGroup") { client, _, body, contentType ->
                client.createGroup(body = body, contentType = contentType)
            },
            BodyScenario("updateGroup") { client, groupId, body, contentType ->
                client.updateGroup(groupId, body = body, contentType = contentType)
            },
        )
    }
}
