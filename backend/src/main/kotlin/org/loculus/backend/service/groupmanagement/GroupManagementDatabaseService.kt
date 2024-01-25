package org.loculus.backend.service.groupmanagement

import org.jetbrains.exposed.exceptions.ExposedSQLException
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
import org.loculus.backend.api.Group
import org.loculus.backend.api.GroupDetails
import org.loculus.backend.controller.ConflictException
import org.loculus.backend.model.UNIQUE_CONSTRAINT_VIOLATION_SQL_STATE
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional
class GroupManagementDatabaseService(
    private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
) {

    fun getDetailsOfGroup(groupName: String, username: String): GroupDetails {
        val users = groupManagementPreconditionValidator.validateUserInExistingGroupAndReturnUserList(
            groupName,
            username,
        )

        return GroupDetails(groupName, users)
    }

    fun createNewGroup(groupName: String, username: String) {
        try {
            GroupsTable.insert {
                it[groupNameColumn] = groupName
            }
        } catch (e: ExposedSQLException) {
            if (e.sqlState == UNIQUE_CONSTRAINT_VIOLATION_SQL_STATE) {
                throw ConflictException(
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
        groupManagementPreconditionValidator.validateId(usernameToAdd)

        groupManagementPreconditionValidator.validateUserInExistingGroupAndReturnUserList(groupName, groupMember)

        try {
            UserGroupsTable.insert {
                it[userNameColumn] = usernameToAdd
                it[groupNameColumn] = groupName
            }
        } catch (e: ExposedSQLException) {
            if (e.sqlState == UNIQUE_CONSTRAINT_VIOLATION_SQL_STATE) {
                throw ConflictException(
                    "User $usernameToAdd is already member of the group $groupName.",
                )
            }
            throw e
        }
    }

    fun removeUserFromGroup(groupMember: String, groupName: String, usernameToRemove: String) {
        groupManagementPreconditionValidator.validateUserInExistingGroupAndReturnUserList(groupName, groupMember)

        UserGroupsTable.deleteWhere {
            (userNameColumn eq usernameToRemove) and
                (groupNameColumn eq groupName)
        }
    }

    fun getAllGroups(): List<Group> {
        return GroupsTable
            .selectAll()
            .map { Group(it[GroupsTable.groupNameColumn]) }
    }
}
