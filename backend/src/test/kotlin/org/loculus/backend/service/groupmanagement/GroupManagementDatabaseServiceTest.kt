package org.loculus.backend.service.groupmanagement

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.mockk
import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.MatcherAssert.assertThat
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.errors.UnprocessableEntityException
import org.loculus.backend.service.KeycloakAdapter
import org.loculus.backend.testutil.DEFAULT_GROUP
import org.loculus.backend.testutil.DEFAULT_USER_NAME
import org.loculus.backend.testutil.EndpointTest
import org.loculus.backend.types.NewGroup
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class GroupManagementDatabaseServiceTest(@Autowired private val service: GroupManagementDatabaseService) {
    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    private val user = mockk<AuthenticatedUser>().also {
        every { it.username } returns DEFAULT_USER_NAME
        every { it.isSuperUser } returns false
    }

    @BeforeEach
    fun setup() {
        every { keycloakAdapter.getUsersWithName(any()) } answers {
            listOf(UserRepresentation().apply { username = firstArg<String>().lowercase() })
        }
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

    companion object {
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
