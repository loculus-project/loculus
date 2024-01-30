package org.loculus.backend.service.groupmanagement

import org.jetbrains.exposed.sql.select
import org.loculus.backend.api.User
import org.loculus.backend.controller.ForbiddenException
import org.loculus.backend.controller.NotFoundException
import org.loculus.backend.service.KeycloakAdapter
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class GroupManagementPreconditionValidator(
    private val keycloakAdapter: KeycloakAdapter,
) {

    @Transactional
    fun validateUserInExistingGroupAndReturnUserList(groupName: String, groupMember: String): List<User> {
        if (GroupsTable
                .select { GroupsTable.groupNameColumn eq groupName }
                .firstOrNull() == null
        ) {
            throw NotFoundException("Group $groupName does not exist.")
        }

        val users = UserGroupsTable
            .select { UserGroupsTable.groupNameColumn eq groupName }
            .map { User(it[UserGroupsTable.userNameColumn]) }

        if (users.none { it.name == groupMember }) {
            throw ForbiddenException("User $groupMember is not a member of the group $groupName. Action not allowed.")
        }

        return users
    }

    fun validateThatUserExists(username: String) {
        val users = keycloakAdapter.getUsersWithName(username)
        when {
            users.isEmpty() -> throw NotFoundException("User $username does not exist.")
            users.size > 1 -> throw IllegalStateException("Multiple users with name $username exist.")
        }
    }
}
