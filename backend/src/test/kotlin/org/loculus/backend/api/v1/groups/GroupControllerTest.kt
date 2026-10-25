package org.loculus.backend.api.v1.groups

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.containsInAnyOrder
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.service.KeycloakAdapter
import org.loculus.backend.testutil.ALTERNATIVE_DEFAULT_USER_NAME
import org.loculus.backend.testutil.DEFAULT_USER_NAME
import org.loculus.backend.testutil.EndpointTest
import org.loculus.backend.testutil.generateJwtFor
import org.loculus.backend.testutil.jwtForAlternativeUser
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.util.UUID

@EndpointTest
@Import(GroupClient::class)
class GroupControllerTest(@Autowired private val client: GroupClient) {
    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    @BeforeEach
    fun setup() {
        every { keycloakAdapter.getUsersWithName(any()) } answers {
            listOf(UserRepresentation().apply { username = firstArg<String>().lowercase() })
        }
    }

    @Test
    fun `WHEN creating a group THEN it is returned with status 201`() {
        client.createGroup()
            .andExpect(status().isCreated)
            .andExpect(jsonPath("\$.groupId").isNumber)
            .andExpect(jsonPath("\$.groupName").value(GROUP_REQUEST.groupName))
            .andExpect(jsonPath("\$.institution").value(GROUP_REQUEST.institution))
            .andExpect(jsonPath("\$.address.line1").value(GROUP_REQUEST.address.line1))
            .andExpect(jsonPath("\$.address.city").value(GROUP_REQUEST.address.city))
            .andExpect(jsonPath("\$.contactEmail").value(GROUP_REQUEST.contactEmail))
    }

    @Test
    fun `GIVEN a group WHEN getting it THEN the contact email is only shown when authenticated`() {
        val groupId = client.createGroup().andGetGroupId()

        client.getGroup(groupId)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.groupId").value(groupId))
            .andExpect(jsonPath("\$.groupName").value(GROUP_REQUEST.groupName))
            .andExpect(jsonPath("\$.contactEmail").value(GROUP_REQUEST.contactEmail))
            .andExpect(jsonPath("\$.users").doesNotExist())

        client.getGroup(groupId, jwt = null)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.groupName").value(GROUP_REQUEST.groupName))
            .andExpect(jsonPath("\$.contactEmail").isEmpty)
    }

    @Test
    fun `WHEN getting a group that does not exist THEN returns 404`() {
        client.getGroup(123456789)
            .andExpect(status().isNotFound)
    }

    @Test
    fun `WHEN calling endpoints that need a token without one THEN returns 401`() {
        val groupId = client.createGroup().andGetGroupId()

        client.getGroups(jwt = null).andExpect(status().isUnauthorized)
        client.createGroup(jwt = null).andExpect(status().isUnauthorized)
        client.updateGroup(groupId, jwt = null).andExpect(status().isUnauthorized)
        client.getMembers(groupId, jwt = null).andExpect(status().isUnauthorized)
        client.addMember(groupId, ALTERNATIVE_DEFAULT_USER_NAME, jwt = null).andExpect(status().isUnauthorized)
        client.removeMember(groupId, DEFAULT_USER_NAME, jwt = null).andExpect(status().isUnauthorized)
        client.getMyGroups(jwt = null).andExpect(status().isUnauthorized)
    }

    @Test
    fun `GIVEN a group member WHEN updating the group THEN the group is changed`() {
        val groupId = client.createGroup().andGetGroupId()
        val changedGroup = GROUP_REQUEST.copy(groupName = "v1GroupChanged")

        client.updateGroup(groupId, changedGroup)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.groupName").value(changedGroup.groupName))

        client.getGroup(groupId)
            .andExpect(jsonPath("\$.groupName").value(changedGroup.groupName))
    }

    @Test
    fun `GIVEN a user who is not a member WHEN updating the group THEN returns 403`() {
        val groupId = client.createGroup().andGetGroupId()

        client.updateGroup(groupId, jwt = jwtForAlternativeUser)
            .andExpect(status().isForbidden)
    }

    @Test
    fun `GIVEN a group WHEN adding and removing a member THEN the members list follows`() {
        val groupId = client.createGroup().andGetGroupId()

        client.getMembers(groupId)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$[*].username", contains(DEFAULT_USER_NAME)))

        client.addMember(groupId, ALTERNATIVE_DEFAULT_USER_NAME)
            .andExpect(status().isNoContent)
        client.getMembers(groupId)
            .andExpect(jsonPath("\$[*].username", containsInAnyOrder(DEFAULT_USER_NAME, ALTERNATIVE_DEFAULT_USER_NAME)))

        client.addMember(groupId, ALTERNATIVE_DEFAULT_USER_NAME)
            .andExpect(status().isConflict)

        client.removeMember(groupId, ALTERNATIVE_DEFAULT_USER_NAME)
            .andExpect(status().isNoContent)
        client.getMembers(groupId)
            .andExpect(jsonPath("\$[*].username", contains(DEFAULT_USER_NAME)))
    }

    @Test
    fun `GIVEN a user created two groups WHEN getting their groups THEN both are returned ordered by id`() {
        val jwtForNewUser = generateJwtFor(UUID.randomUUID().toString() + "testuser")
        val firstGroupId = client.createGroup(jwt = jwtForNewUser).andGetGroupId()
        val secondGroupId = client.createGroup(GROUP_REQUEST.copy(groupName = "v1Group2"), jwt = jwtForNewUser)
            .andGetGroupId()

        client.getMyGroups(jwt = jwtForNewUser)
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$[*].groupId", contains(firstGroupId, secondGroupId)))
    }

    @Test
    fun `GIVEN a group WHEN filtering groups by name ignoring case THEN only that group is returned`() {
        val groupName = "v1Group" + UUID.randomUUID()
        val groupId = client.createGroup(GROUP_REQUEST.copy(groupName = groupName)).andGetGroupId()

        client.getGroups(name = groupName.uppercase())
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$[*].groupId", contains(groupId)))
    }
}
