package org.loculus.backend.service.groupmanagement

import org.jetbrains.exposed.exceptions.ExposedSQLException
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
import org.loculus.backend.api.Address
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

        return GroupDetails(getDetailsOfGroup(groupName), users)
    }

    fun getDetailsOfGroup(groupName: String): Group {
        return GroupsTable
            .select { GroupsTable.groupNameColumn eq groupName }
            .map {
                Group(
                    groupName = it[GroupsTable.groupNameColumn],
                    institution = it[GroupsTable.institutionColumn],
                    address = Address(
                        line1 = it[GroupsTable.addressLine1],
                        line2 = it[GroupsTable.addressLine2],
                        postalCode = it[GroupsTable.addressPostalCode],
                        city = it[GroupsTable.addressCity],
                        state = it[GroupsTable.addressState],
                        country = it[GroupsTable.addressCountry],
                    ),
                    contactEmail = it[GroupsTable.contactEmailColumn],
                )
            }
            .firstOrNull()
            ?: throw IllegalArgumentException("Group $groupName does not exist.")
    }

    fun createNewGroup(group: Group, username: String) {
        try {
            GroupsTable.insert {
                it[groupNameColumn] = group.groupName
                it[institutionColumn] = group.institution
                it[addressLine1] = group.address.line1
                it[addressLine2] = group.address.line2
                it[addressPostalCode] = group.address.postalCode
                it[addressState] = group.address.state
                it[addressCity] = group.address.city
                it[addressCountry] = group.address.country
                it[contactEmailColumn] = group.contactEmail
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
            it[groupNameColumn] = group.groupName
        }
    }

    fun getGroupsOfUser(username: String): List<Group> {
        return UserGroupsTable.join(
            GroupsTable,
            JoinType.LEFT,
            additionalConstraint = {
                (UserGroupsTable.groupNameColumn eq GroupsTable.groupNameColumn)
            },
        )
            .select { UserGroupsTable.userNameColumn eq username }
            .map {
                Group(
                    groupName = it[GroupsTable.groupNameColumn],
                    institution = it[GroupsTable.institutionColumn],
                    address = Address(
                        line1 = it[GroupsTable.addressLine1],
                        line2 = it[GroupsTable.addressLine2],
                        postalCode = it[GroupsTable.addressPostalCode],
                        city = it[GroupsTable.addressCity],
                        state = it[GroupsTable.addressState],
                        country = it[GroupsTable.addressCountry],
                    ),
                    contactEmail = it[GroupsTable.contactEmailColumn],
                )
            }
    }

    fun addUserToGroup(groupMember: String, groupName: String, usernameToAdd: String) {
        groupManagementPreconditionValidator.validateThatUserExists(usernameToAdd)

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
            .map {
                Group(
                    groupName = it[GroupsTable.groupNameColumn],
                    institution = it[GroupsTable.institutionColumn],
                    address = Address(
                        line1 = it[GroupsTable.addressLine1],
                        line2 = it[GroupsTable.addressLine2],
                        postalCode = it[GroupsTable.addressPostalCode],
                        city = it[GroupsTable.addressCity],
                        state = it[GroupsTable.addressState],
                        country = it[GroupsTable.addressCountry],
                    ),
                    contactEmail = it[GroupsTable.contactEmailColumn],
                )
            }
    }
}
