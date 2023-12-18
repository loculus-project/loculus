package org.pathoplexus.backend.service

import org.jetbrains.exposed.exceptions.ExposedSQLException
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.select
import org.pathoplexus.backend.api.Group
import org.pathoplexus.backend.api.GroupDetails
import org.pathoplexus.backend.api.User
import org.pathoplexus.backend.controller.BadRequestException
import org.pathoplexus.backend.controller.ForbiddenException
import org.pathoplexus.backend.controller.NotFoundException
import org.pathoplexus.backend.model.UNIQUE_CONSTRAINT_VIOLATION_SQL_STATE
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional
class GroupManagementDatabaseService {

    fun getDetailsOfGroup(groupName: String, username: String): GroupDetails {
        val users = UserGroupsTable
            .select { UserGroupsTable.groupNameColumn eq groupName }
            .map { User(it[UserGroupsTable.userNameColumn]) }

        if (users.isEmpty()) {
            throw NotFoundException("Group does not exist")
        }

        if (users.none { it.name == username }) {
            throw ForbiddenException("Group does not contain user")
        }

        return GroupDetails(groupName, users)
    }

    fun createNewGroup(groupName: String, username: String) {
        try {
            GroupsTable.insert {
                it[groupNameColumn] = groupName
            }
        } catch (e: ExposedSQLException) {
            if (e.sqlState == UNIQUE_CONSTRAINT_VIOLATION_SQL_STATE) {
                throw BadRequestException(
                    "Group name already exists. Please choose a different name.",
                )
            }
            throw e
        }

        UserGroupsTable.insert {
            it[userNameColumn] = username
            it[groupNameColumn] = groupName
        }
    }

    fun getGroupsOfUser(username: String): List<Group> {
        return UserGroupsTable
            .select { UserGroupsTable.userNameColumn eq username }
            .map { Group(it[UserGroupsTable.groupNameColumn]) }
    }

    fun addUserToGroup(groupMember: String, groupName: String, usernameToAdd: String) {
        val users = UserGroupsTable
            .select { UserGroupsTable.groupNameColumn eq groupName }
            .map { User(it[UserGroupsTable.userNameColumn]) }

        if (users.isEmpty()) {
            throw NotFoundException("Group does not exist.")
        }

        if (users.none { it.name == groupMember }) {
            throw ForbiddenException("User $groupMember is not a member of the group and cannot add other users.")
        }

        try {
            UserGroupsTable.insert {
                it[userNameColumn] = usernameToAdd
                it[groupNameColumn] = groupName
            }
        } catch (e: ExposedSQLException) {
            if (e.sqlState == UNIQUE_CONSTRAINT_VIOLATION_SQL_STATE) {
                throw BadRequestException(
                    "User $usernameToAdd is already member of the group.",
                )
            }
            throw e
        }
    }
}
