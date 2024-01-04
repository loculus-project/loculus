package org.loculus.backend.service.groupmanagement

import org.jetbrains.exposed.sql.select
import org.loculus.backend.api.User
import org.loculus.backend.controller.ForbiddenException
import org.loculus.backend.controller.NotFoundException
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
@Transactional
class GroupManagementPreconditionValidator {

    /**
     * Validates whether a user is a member of an existing group and returns the list of users in that group.
     *
     * @return the list of users in the group if the user is a member
     * @throws NotFoundException if the group does not exist
     * @throws ForbiddenException if the user is not a member of the group
     */
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
}
