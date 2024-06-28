package org.loculus.backend.service.groupmanagement

import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.selectAll
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.controller.ForbiddenException
import org.loculus.backend.controller.NotFoundException
import org.loculus.backend.service.KeycloakAdapter
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class GroupManagementPreconditionValidator(private val keycloakAdapter: KeycloakAdapter) {

    @Transactional(readOnly = true)
    fun validateUserIsAllowedToModifyGroup(groupId: Int, authenticatedUser: AuthenticatedUser) {
        validateUserIsAllowedToModifyGroups(listOf(groupId), authenticatedUser)
    }

    @Transactional(readOnly = true)
    fun validateUserIsAllowedToReadGroup(groupId: Int, authenticatedUser: AuthenticatedUser) {
        if (authenticatedUser.isGroupReader) {
            return
        }
        validateUserIsAllowedToModifyGroups(listOf(groupId), authenticatedUser)
    }

    @Transactional(readOnly = true)
    fun validateUserIsAllowedToModifyGroups(groupIds: List<Int>, authenticatedUser: AuthenticatedUser) {
        if (authenticatedUser.isSuperUser) {
            return
        }

        val existingGroups = GroupsTable
            .selectAll()
            .where { GroupsTable.id inList groupIds }
            .map { it[GroupsTable.id].value }
            .toSet()

        val nonExistingGroups = groupIds.toSet() - existingGroups

        if (nonExistingGroups.isNotEmpty()) {
            throw NotFoundException("Group(s) ${nonExistingGroups.joinToString()} do not exist.")
        }

        val username = authenticatedUser.username
        val userGroups = UserGroupsTable
            .selectAll()
            .where {
                (UserGroupsTable.groupIdColumn inList existingGroups) and
                    (UserGroupsTable.userNameColumn eq username)
            }
            .map { it[UserGroupsTable.groupIdColumn] }
            .toSet()

        val missingGroups = existingGroups - userGroups

        if (missingGroups.isNotEmpty()) {
            throw ForbiddenException(
                "User $username is not a member of group(s) ${missingGroups.joinToString()}. Action not allowed.",
            )
        }
    }

    fun validateThatUserExists(username: String) {
        val users = keycloakAdapter.getUsersWithName(username)
        when {
            users.isEmpty() -> throw NotFoundException("User $username does not exist.")
            users.size > 1 -> throw IllegalStateException("Multiple users with name $username exist.")
        }
    }
}
