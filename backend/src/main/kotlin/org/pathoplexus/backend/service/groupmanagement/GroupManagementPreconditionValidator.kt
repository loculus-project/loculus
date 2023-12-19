package org.pathoplexus.backend.service.groupmanagement

import org.jetbrains.exposed.sql.select
import org.pathoplexus.backend.api.User
import org.pathoplexus.backend.controller.ForbiddenException
import org.pathoplexus.backend.controller.NotFoundException
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
@Transactional
class GroupManagementPreconditionValidator {

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
