package org.loculus.backend.service.groupmanagement

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.mockk
import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.MatcherAssert.assertThat
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertDoesNotThrow
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.auth.AnonymousUser
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.errors.ConflictException
import org.loculus.backend.errors.ForbiddenException
import org.loculus.backend.errors.NotFoundException
import org.loculus.backend.errors.UnprocessableEntityException
import org.loculus.backend.service.KeycloakAdapter
import org.loculus.backend.testutil.ALTERNATIVE_DEFAULT_GROUP
import org.loculus.backend.testutil.ALTERNATIVE_DEFAULT_GROUP_NAME
import org.loculus.backend.testutil.ALTERNATIVE_DEFAULT_USER_NAME
import org.loculus.backend.testutil.DEFAULT_GROUP
import org.loculus.backend.testutil.DEFAULT_GROUP_CHANGED
import org.loculus.backend.testutil.DEFAULT_GROUP_NAME
import org.loculus.backend.testutil.DEFAULT_USER_NAME
import org.loculus.backend.testutil.EndpointTest
import org.loculus.backend.testutil.SUPER_USER_NAME
import org.loculus.backend.types.Group
import org.loculus.backend.types.NewGroup
import org.loculus.backend.types.User
import org.springframework.beans.factory.annotation.Autowired

private const val NON_EXISTENT_GROUP_ID = 123456789
private const val NON_EXISTENT_USER_NAME = "nonExistentUser"

@EndpointTest
class GroupManagementDatabaseServiceTest(@Autowired private val service: GroupManagementDatabaseService) {
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
    @MethodSource("functionsRequiringMembership")
    fun `GIVEN a group WHEN a non-member calls a function requiring membership THEN it is forbidden`(
        scenario: Scenario,
    ) {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId

        val exception = assertThrows<ForbiddenException> { scenario.call(service, groupId, otherUser) }
        assertEquals(
            "User $ALTERNATIVE_DEFAULT_USER_NAME is not a member of group(s) $groupId. Action not allowed.",
            exception.message,
        )
    }

    @ParameterizedTest
    @MethodSource("functionsWithGroupId")
    fun `WHEN the group does not exist THEN it is not found`(scenario: Scenario) {
        val exception = assertThrows<NotFoundException> { scenario.call(service, NON_EXISTENT_GROUP_ID, user) }

        assertEquals("Group $NON_EXISTENT_GROUP_ID does not exist.", exception.message)
    }

    @Test
    fun `GIVEN a group WHEN an authenticated user gets its details THEN all fields are returned`() {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId

        assertEquals(DEFAULT_GROUP.toGroup(groupId), service.getGroupDetails(groupId, user))
    }

    @Test
    fun `GIVEN a group WHEN an anonymous user gets its details THEN the contact email is hidden`() {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId

        assertEquals(
            DEFAULT_GROUP.toGroup(groupId).copy(contactEmail = null),
            service.getGroupDetails(groupId, AnonymousUser()),
        )
    }

    @Test
    fun `GIVEN a new group WHEN getting its users THEN the creator is the only user`() {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId

        assertEquals(listOf(User(DEFAULT_USER_NAME)), service.getGroupUsers(groupId, user))
    }

    @Test
    fun `WHEN creating a group with a name of 255 characters THEN the group is created`() {
        val group = service.createGroup(DEFAULT_GROUP.copy(groupName = "a".repeat(255)), user)

        assertEquals("a".repeat(255), group.groupName)
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("tooLongFieldTestCases")
    fun `WHEN creating a group with a field longer than 255 characters THEN it is rejected`(
        fieldPath: String,
        group: NewGroup,
    ) {
        val exception = assertThrows<UnprocessableEntityException> { service.createGroup(group, user) }
        assertThat(exception.message, containsString(fieldPath))
    }

    @Test
    fun `GIVEN a group WHEN a member updates it THEN the group is updated`() {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId

        assertEquals(DEFAULT_GROUP_CHANGED.toGroup(groupId), service.updateGroup(groupId, DEFAULT_GROUP_CHANGED, user))
        assertEquals(DEFAULT_GROUP_CHANGED.toGroup(groupId), service.getGroupDetails(groupId, user))
    }

    @Test
    fun `GIVEN a group WHEN a superuser updates it THEN the group is updated`() {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId
        service.updateGroup(groupId, DEFAULT_GROUP_CHANGED, superUser)

        assertEquals(DEFAULT_GROUP_CHANGED.toGroup(groupId), service.getGroupDetails(groupId, user))
    }

    @Test
    fun `GIVEN a group WHEN a non-member tries to update it THEN the group is unchanged`() {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId

        assertThrows<ForbiddenException> { service.updateGroup(groupId, DEFAULT_GROUP_CHANGED, otherUser) }
        assertEquals(DEFAULT_GROUP.toGroup(groupId), service.getGroupDetails(groupId, user))
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("tooLongFieldTestCases")
    fun `WHEN updating a group with a field longer than 255 characters THEN it is rejected`(
        fieldPath: String,
        group: NewGroup,
    ) {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId

        val exception = assertThrows<UnprocessableEntityException> { service.updateGroup(groupId, group, user) }
        assertThat(exception.message, containsString(fieldPath))
    }

    @Test
    fun `GIVEN groups of different users WHEN getting the groups of a user THEN only their groups are returned`() {
        val ownGroupId = service.createGroup(DEFAULT_GROUP, user).groupId
        service.createGroup(ALTERNATIVE_DEFAULT_GROUP, otherUser)

        assertEquals(listOf(ownGroupId), service.getGroupsOfUser(user).map { it.groupId })
    }

    @Test
    fun `GIVEN groups of different users WHEN getting the groups of a superuser THEN all groups are returned`() {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId
        val otherGroupId = service.createGroup(ALTERNATIVE_DEFAULT_GROUP, otherUser).groupId

        assertEquals(setOf(groupId, otherGroupId), service.getGroupsOfUser(superUser).map { it.groupId }.toSet())
    }

    @Test
    fun `GIVEN a group WHEN a member adds a user THEN the user is in the group`() {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId
        service.addUserToGroup(user, groupId, ALTERNATIVE_DEFAULT_USER_NAME)

        assertEquals(
            setOf(User(DEFAULT_USER_NAME), User(ALTERNATIVE_DEFAULT_USER_NAME)),
            service.getGroupUsers(groupId, user).toSet(),
        )
    }

    @Test
    fun `GIVEN a group WHEN a superuser adds a user THEN the user is in the group`() {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId
        service.addUserToGroup(superUser, groupId, ALTERNATIVE_DEFAULT_USER_NAME)

        assertEquals(
            setOf(User(DEFAULT_USER_NAME), User(ALTERNATIVE_DEFAULT_USER_NAME)),
            service.getGroupUsers(groupId, user).toSet(),
        )
    }

    @Test
    fun `GIVEN a group WHEN adding a user with a different case THEN the Keycloak username is stored`() {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId
        service.addUserToGroup(user, groupId, "OtherUser")

        assertEquals(setOf(User(DEFAULT_USER_NAME), User("otheruser")), service.getGroupUsers(groupId, user).toSet())
    }

    @Test
    fun `GIVEN a group member WHEN adding them again with a different case THEN it is a conflict`() {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId

        val exception = assertThrows<ConflictException> {
            service.addUserToGroup(user, groupId, DEFAULT_USER_NAME.uppercase())
        }
        assertEquals("User $DEFAULT_USER_NAME is already member of the group $groupId.", exception.message)
    }

    @Test
    fun `GIVEN a group WHEN adding a user that does not exist THEN the user is not found`() {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId

        val exception = assertThrows<NotFoundException> {
            service.addUserToGroup(user, groupId, NON_EXISTENT_USER_NAME)
        }
        assertEquals("User $NON_EXISTENT_USER_NAME does not exist.", exception.message)
    }

    @Test
    fun `GIVEN a group WHEN a non-member adds a user that does not exist THEN it is forbidden`() {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId

        assertThrows<ForbiddenException> { service.addUserToGroup(otherUser, groupId, NON_EXISTENT_USER_NAME) }
    }

    @Test
    fun `GIVEN a group member WHEN a member removes them THEN they are no longer in the group`() {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId
        service.addUserToGroup(user, groupId, ALTERNATIVE_DEFAULT_USER_NAME)
        service.removeUserFromGroup(user, groupId, ALTERNATIVE_DEFAULT_USER_NAME)

        assertEquals(listOf(User(DEFAULT_USER_NAME)), service.getGroupUsers(groupId, user))
    }

    @Test
    fun `GIVEN a group member WHEN a superuser removes them THEN they are no longer in the group`() {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId
        service.removeUserFromGroup(superUser, groupId, DEFAULT_USER_NAME)

        assertEquals(emptyList<User>(), service.getGroupUsers(groupId, user))
    }

    @Test
    fun `GIVEN a group member WHEN removing them with a different case THEN they are no longer in the group`() {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId
        service.addUserToGroup(user, groupId, ALTERNATIVE_DEFAULT_USER_NAME)
        service.removeUserFromGroup(user, groupId, ALTERNATIVE_DEFAULT_USER_NAME.uppercase())

        assertEquals(listOf(User(DEFAULT_USER_NAME)), service.getGroupUsers(groupId, user))
    }

    @Test
    fun `GIVEN a user not in the group WHEN removing them THEN nothing changes`() {
        val groupId = service.createGroup(DEFAULT_GROUP, user).groupId

        assertDoesNotThrow { service.removeUserFromGroup(user, groupId, ALTERNATIVE_DEFAULT_USER_NAME) }
        assertEquals(listOf(User(DEFAULT_USER_NAME)), service.getGroupUsers(groupId, user))
    }

    @Test
    fun `GIVEN groups WHEN getting groups without a name THEN all groups are returned`() {
        service.createGroup(DEFAULT_GROUP, user)
        service.createGroup(ALTERNATIVE_DEFAULT_GROUP, user)

        assertEquals(
            setOf(DEFAULT_GROUP_NAME, ALTERNATIVE_DEFAULT_GROUP_NAME),
            service.getGroups(null).map { it.groupName }.toSet(),
        )
    }

    @Test
    fun `GIVEN groups WHEN getting groups by name THEN only whole-name matches are returned, ignoring case`() {
        service.createGroup(DEFAULT_GROUP, user)
        service.createGroup(ALTERNATIVE_DEFAULT_GROUP, user)

        assertEquals(listOf(DEFAULT_GROUP_NAME), service.getGroups(DEFAULT_GROUP_NAME.uppercase()).map { it.groupName })
    }

    companion object {
        private val user = authenticatedUser(DEFAULT_USER_NAME)
        private val otherUser = authenticatedUser(ALTERNATIVE_DEFAULT_USER_NAME)
        private val superUser = authenticatedUser(SUPER_USER_NAME, isSuperUser = true)

        private fun authenticatedUser(username: String, isSuperUser: Boolean = false) =
            mockk<AuthenticatedUser>().also {
                every { it.username } returns username
                every { it.isSuperUser } returns isSuperUser
            }

        private fun NewGroup.toGroup(groupId: Int) = Group(
            groupId = groupId,
            groupName = groupName,
            institution = institution,
            address = address,
            contactEmail = contactEmail,
        )

        data class Scenario(
            val name: String,
            val call: (service: GroupManagementDatabaseService, groupId: Int, user: AuthenticatedUser) -> Unit,
        ) {
            override fun toString() = name
        }

        private val getGroupDetails = Scenario("getGroupDetails") { service, groupId, user ->
            service.getGroupDetails(groupId, user)
        }
        private val getGroupUsers = Scenario("getGroupUsers") { service, groupId, user ->
            service.getGroupUsers(groupId, user)
        }
        private val updateGroup = Scenario("updateGroup") { service, groupId, user ->
            service.updateGroup(groupId, DEFAULT_GROUP_CHANGED, user)
        }
        private val addUserToGroup = Scenario("addUserToGroup") { service, groupId, user ->
            service.addUserToGroup(user, groupId, ALTERNATIVE_DEFAULT_USER_NAME)
        }
        private val removeUserFromGroup = Scenario("removeUserFromGroup") { service, groupId, user ->
            service.removeUserFromGroup(user, groupId, DEFAULT_USER_NAME)
        }

        @JvmStatic
        fun functionsRequiringMembership(): List<Scenario> = listOf(updateGroup, addUserToGroup, removeUserFromGroup)

        @JvmStatic
        fun functionsWithGroupId(): List<Scenario> =
            listOf(getGroupDetails, getGroupUsers, updateGroup, addUserToGroup, removeUserFromGroup)

        private val tooLong = "a".repeat(256)

        private fun testCase(fieldPath: String, change: NewGroup.() -> NewGroup) =
            Arguments.of(fieldPath, DEFAULT_GROUP.change())

        @JvmStatic
        fun tooLongFieldTestCases(): List<Arguments> = listOf(
            testCase("groupName") { copy(groupName = tooLong) },
            testCase("institution") { copy(institution = tooLong) },
            testCase("contactEmail") { copy(contactEmail = tooLong) },
            testCase("address.line1") { copy(address = address.copy(line1 = tooLong)) },
            testCase("address.line2") { copy(address = address.copy(line2 = tooLong)) },
            testCase("address.city") { copy(address = address.copy(city = tooLong)) },
            testCase("address.state") { copy(address = address.copy(state = tooLong)) },
            testCase("address.postalCode") { copy(address = address.copy(postalCode = tooLong)) },
            testCase("address.country") { copy(address = address.copy(country = tooLong)) },
        )
    }
}
