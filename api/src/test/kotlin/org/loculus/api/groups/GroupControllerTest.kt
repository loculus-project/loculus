package org.loculus.api.groups

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.CoreMatchers.endsWith
import org.hamcrest.CoreMatchers.instanceOf
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.api.ALTERNATIVE_USER_NAME
import org.loculus.api.ApiTest
import org.loculus.api.DEFAULT_USER_NAME
import org.loculus.api.generateJwtFor
import org.loculus.api.jwtForAlternativeUser
import org.loculus.api.jwtForSuperUser
import org.loculus.api.querySingleColumn
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@ApiTest
class GroupControllerTest(@Autowired private val client: GroupClient) {
    @MockkBean
    lateinit var userDirectory: UserDirectory

    @BeforeEach
    fun setup() {
        every { userDirectory.userExists(any()) } returns true
    }

    @Test
    fun `WHEN creating a group THEN returns 201 with the group and its location, and the creator is the only member`() {
        val groupId = client.createGroup()
            .andExpect(status().isCreated)
            .andExpect(header().string(HttpHeaders.LOCATION, endsWith("/v2/groups/1")))
            .verifyGroup("\$", DEFAULT_GROUP)
            .andGetGroupId()

        client.getMembers(groupId)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$[*].name", contains(DEFAULT_USER_NAME)))
    }

    @Test
    fun `WHEN creating a group THEN an audit log entry is written in the backend's format`() {
        client.createGroup().andExpect(status().isCreated)

        val auditLog = querySingleColumn("select description from audit_log")

        assert(auditLog == listOf("Created group: 1 with groupName ${DEFAULT_GROUP.groupName}")) { auditLog }
    }

    @Test
    fun `WHEN creating a group with missing fields THEN returns 400`() {
        client.createGroupWithBody("{}")
            .andExpect(status().isBadRequest)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("\$.detail", containsString("groupName")))
    }

    @Test
    fun `GIVEN a group WHEN getting it authenticated THEN returns all details`() {
        val groupId = client.createGroup().andGetGroupId()

        client.getGroup(groupId)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .verifyGroup("\$", DEFAULT_GROUP)
    }

    @Test
    fun `GIVEN a group WHEN getting it unauthenticated THEN the contact email is redacted`() {
        val groupId = client.createGroup().andGetGroupId()

        client.getGroup(groupId, jwt = null)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.groupName").value(DEFAULT_GROUP.groupName))
            .andExpect(jsonPath("\$.address.city").value(DEFAULT_GROUP.address.city))
            .andExpect(jsonPath("\$.contactEmail").value(nullValue()))
    }

    @Test
    fun `WHEN getting a non-existing group THEN returns 404`() {
        client.getGroup(123456789)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("\$.detail").value("Group 123456789 does not exist."))
    }

    @Test
    fun `GIVEN groups WHEN listing groups THEN returns all groups ordered by id`() {
        client.createGroup(DEFAULT_GROUP)
        client.createGroup(ALTERNATIVE_GROUP)

        client.getGroups()
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$[*].groupName", contains(DEFAULT_GROUP.groupName, ALTERNATIVE_GROUP.groupName)))
    }

    @Test
    fun `GIVEN groups WHEN filtering by name THEN matches case-insensitively and exactly`() {
        client.createGroup(DEFAULT_GROUP)
        client.createGroup(ALTERNATIVE_GROUP)

        client.getGroups(name = DEFAULT_GROUP.groupName.uppercase())
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$", hasSize<Any>(1)))
            .andExpect(jsonPath("\$[0].groupName").value(DEFAULT_GROUP.groupName))
    }

    @Test
    fun `GIVEN groups of different users WHEN getting my groups THEN returns only mine, but all for superusers`() {
        client.createGroup(DEFAULT_GROUP)
        client.createGroup(ALTERNATIVE_GROUP, jwt = jwtForAlternativeUser)

        client.getMyGroups()
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$[*].groupName", contains(DEFAULT_GROUP.groupName)))
            .andExpect(jsonPath("\$[0].contactEmail").value(DEFAULT_GROUP.contactEmail))

        client.getMyGroups(jwt = jwtForSuperUser)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$[*].groupName", contains(DEFAULT_GROUP.groupName, ALTERNATIVE_GROUP.groupName)))
    }

    @Test
    fun `GIVEN I'm a member WHEN I update the group THEN it is updated`() {
        val groupId = client.createGroup().andGetGroupId()

        client.updateGroup(groupId, CHANGED_GROUP)
            .andExpect(status().isOk)
            .verifyGroup("\$", CHANGED_GROUP)

        client.getGroup(groupId).verifyGroup("\$", CHANGED_GROUP)
    }

    @Test
    fun `GIVEN I'm a superuser WHEN I update a group THEN it is updated`() {
        val groupId = client.createGroup().andGetGroupId()

        client.updateGroup(groupId, CHANGED_GROUP, jwt = jwtForSuperUser)
            .andExpect(status().isOk)
            .verifyGroup("\$", CHANGED_GROUP)
    }

    @Test
    fun `GIVEN I'm not a member WHEN I update the group THEN returns 403 and nothing changes`() {
        val groupId = client.createGroup().andGetGroupId()

        client.updateGroup(groupId, CHANGED_GROUP, jwt = jwtForAlternativeUser)
            .andExpect(status().isForbidden)
            .andExpect(
                jsonPath("\$.detail")
                    .value("User $ALTERNATIVE_USER_NAME is not a member of group $groupId. Action not allowed."),
            )

        client.getGroup(groupId).verifyGroup("\$", DEFAULT_GROUP)
    }

    @Test
    fun `WHEN updating a non-existing group THEN returns 404`() {
        client.updateGroup(123456789, CHANGED_GROUP)
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("\$.detail").value("Group 123456789 does not exist."))
    }

    @Test
    fun `GIVEN a group WHEN a member adds a user THEN the user is a member`() {
        val groupId = client.createGroup().andGetGroupId()

        client.addMember(groupId, ALTERNATIVE_USER_NAME)
            .andExpect(status().isNoContent)

        client.getMembers(groupId)
            .andExpect(jsonPath("\$[*].name", contains(DEFAULT_USER_NAME, ALTERNATIVE_USER_NAME)))
    }

    @Test
    fun `GIVEN a group WHEN a superuser adds a user THEN the user is a member`() {
        val groupId = client.createGroup().andGetGroupId()

        client.addMember(groupId, ALTERNATIVE_USER_NAME, jwt = jwtForSuperUser)
            .andExpect(status().isNoContent)

        client.getMembers(groupId)
            .andExpect(jsonPath("\$[*].name", contains(DEFAULT_USER_NAME, ALTERNATIVE_USER_NAME)))
    }

    @Test
    fun `GIVEN a group WHEN adding a user that does not exist THEN returns 404`() {
        every { userDirectory.userExists(any()) } returns false
        val groupId = client.createGroup().andGetGroupId()

        client.addMember(groupId, "doesNotExist")
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("\$.detail").value("User doesNotExist does not exist."))
    }

    @Test
    fun `GIVEN a group WHEN adding an existing member THEN returns 409`() {
        val groupId = client.createGroup().andGetGroupId()

        client.addMember(groupId, DEFAULT_USER_NAME)
            .andExpect(status().isConflict)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("\$.detail").value("User $DEFAULT_USER_NAME is already a member of group $groupId."))
    }

    @Test
    fun `GIVEN a group WHEN a non-member adds a user THEN returns 403`() {
        val groupId = client.createGroup(jwt = jwtForAlternativeUser).andGetGroupId()

        client.addMember(groupId, DEFAULT_USER_NAME)
            .andExpect(status().isForbidden)
    }

    @Test
    fun `WHEN adding a user to a non-existing group THEN returns 404`() {
        client.addMember(123456789, DEFAULT_USER_NAME)
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("\$.detail").value("Group 123456789 does not exist."))
    }

    @Test
    fun `GIVEN a group with two members WHEN a member removes the other THEN only one member is left`() {
        val groupId = client.createGroup().andGetGroupId()
        client.addMember(groupId, ALTERNATIVE_USER_NAME).andExpect(status().isNoContent)

        client.removeMember(groupId, ALTERNATIVE_USER_NAME)
            .andExpect(status().isNoContent)

        client.getMembers(groupId)
            .andExpect(jsonPath("\$[*].name", contains(DEFAULT_USER_NAME)))
    }

    @Test
    fun `GIVEN a group WHEN a superuser removes a member THEN the group has no members`() {
        val groupId = client.createGroup().andGetGroupId()

        client.removeMember(groupId, DEFAULT_USER_NAME, jwt = jwtForSuperUser)
            .andExpect(status().isNoContent)

        client.getMembers(groupId)
            .andExpect(jsonPath("\$", hasSize<Any>(0)))
    }

    @Test
    fun `GIVEN a group WHEN a non-member removes a member THEN returns 403`() {
        val groupId = client.createGroup(jwt = jwtForAlternativeUser).andGetGroupId()

        client.removeMember(groupId, ALTERNATIVE_USER_NAME)
            .andExpect(status().isForbidden)
            .andExpect(
                jsonPath("\$.detail")
                    .value("User $DEFAULT_USER_NAME is not a member of group $groupId. Action not allowed."),
            )
    }

    @Test
    fun `WHEN removing a user from a non-existing group THEN returns 404`() {
        client.removeMember(123456789, DEFAULT_USER_NAME)
            .andExpect(status().isNotFound)
    }

    @Test
    fun `WHEN getting members of a non-existing group THEN returns 404`() {
        client.getMembers(123456789)
            .andExpect(status().isNotFound)
    }

    @ParameterizedTest
    @MethodSource("endpointsRequiringAuthentication")
    fun `GIVEN no token WHEN calling an endpoint that requires authentication THEN returns 401`(
        scenario: AuthScenario,
    ) {
        scenario.call(client, null)
            .andExpect(status().isUnauthorized)
    }

    @ParameterizedTest
    @MethodSource("endpointsRequiringAuthentication")
    fun `GIVEN an invalid token WHEN calling an endpoint that requires authentication THEN returns 401`(
        scenario: AuthScenario,
    ) {
        scenario.call(client, "invalidToken")
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `GIVEN a token without username WHEN calling an endpoint THEN returns 401`() {
        client.getMyGroups(jwt = generateJwtFor(username = null))
            .andExpect(status().isUnauthorized)
    }

    companion object {
        data class AuthScenario(val name: String, val call: (GroupClient, String?) -> ResultActions) {
            override fun toString() = name
        }

        @JvmStatic
        fun endpointsRequiringAuthentication() = listOf(
            AuthScenario("list groups") { client, jwt -> client.getGroups(jwt = jwt) },
            AuthScenario("create group") { client, jwt -> client.createGroup(jwt = jwt) },
            AuthScenario("update group") { client, jwt -> client.updateGroup(1, CHANGED_GROUP, jwt = jwt) },
            AuthScenario("get members") { client, jwt -> client.getMembers(1, jwt = jwt) },
            AuthScenario("add member") { client, jwt -> client.addMember(1, DEFAULT_USER_NAME, jwt = jwt) },
            AuthScenario("remove member") { client, jwt -> client.removeMember(1, DEFAULT_USER_NAME, jwt = jwt) },
            AuthScenario("my groups") { client, jwt -> client.getMyGroups(jwt = jwt) },
        )
    }
}

private fun ResultActions.verifyGroup(path: String, expected: GroupInput): ResultActions = this
    .andExpect(jsonPath("$path.groupName").value(expected.groupName))
    .andExpect(jsonPath("$path.institution").value(expected.institution))
    .andExpect(jsonPath("$path.address.line1").value(expected.address.line1))
    .andExpect(jsonPath("$path.address.line2").value(expected.address.line2))
    .andExpect(jsonPath("$path.address.city").value(expected.address.city))
    .andExpect(jsonPath("$path.address.state").value(expected.address.state))
    .andExpect(jsonPath("$path.address.postalCode").value(expected.address.postalCode))
    .andExpect(jsonPath("$path.address.country").value(expected.address.country))
    .andExpect(jsonPath("$path.contactEmail").value(expected.contactEmail))
    .andExpect(jsonPath("$path.groupId", instanceOf<Int>(Int::class.javaObjectType)))
