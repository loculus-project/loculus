package org.loculus.backend.service.groupmanagement

import org.jetbrains.exposed.v1.core.JoinType
import org.jetbrains.exposed.v1.core.ResultRow
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.lowerCase
import org.jetbrains.exposed.v1.core.statements.UpdateBuilder
import org.jetbrains.exposed.v1.exceptions.ExposedSQLException
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.insertReturning
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.updateReturning
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.errors.ConflictException
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.model.UNIQUE_CONSTRAINT_VIOLATION_SQL_STATE
import org.loculus.backend.types.Address
import org.loculus.backend.types.Group
import org.loculus.backend.types.NewGroup
import org.loculus.backend.types.User
import org.loculus.backend.utils.DateProvider
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional
class GroupManagementDatabaseService(
    private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
    private val auditLogger: AuditLogger,
    private val dateProvider: DateProvider,
) {
    fun getGroupDetails(groupId: Int, user: org.loculus.backend.auth.User): Group {
        groupManagementPreconditionValidator.validateGroupExists(groupId)

        val groupRow = GroupsTable.selectAll().where {
            GroupsTable.id eq groupId
        }.single()
        return groupRow.toGroup(hideEmail = user !is AuthenticatedUser)
    }

    fun getGroupUsers(groupId: Int, authenticatedUser: AuthenticatedUser): List<User> {
        groupManagementPreconditionValidator.validateGroupExists(groupId)

        val usersQuery = UserGroupsTable.selectAll()
            .where { UserGroupsTable.groupIdColumn eq groupId }
        return usersQuery.map { User(it[UserGroupsTable.userNameColumn]) }
    }

    fun createGroup(group: NewGroup, authenticatedUser: AuthenticatedUser): Group {
        groupManagementPreconditionValidator.validateGroupFields(group)

        val groupRow = GroupsTable.insertReturning {
            it.setGroupFields(group)
            it[createdBy] = authenticatedUser.username
            it[createdAt] = dateProvider.getCurrentDateTime()
        }.single()
        val groupId = groupRow[GroupsTable.id].value

        UserGroupsTable.insert {
            it[userNameColumn] = authenticatedUser.username
            it[groupIdColumn] = groupId
        }

        auditLogger.log(authenticatedUser.username, "Created group: $groupId with groupName ${group.groupName}")
        return groupRow.toGroup()
    }

    fun updateGroup(groupId: Int, group: NewGroup, authenticatedUser: AuthenticatedUser): Group {
        groupManagementPreconditionValidator.validateUserIsAllowedToModifyGroup(groupId, authenticatedUser)
        groupManagementPreconditionValidator.validateGroupFields(group)

        val groupRow = GroupsTable.updateReturning(where = {
            GroupsTable.id eq groupId
        }) { it.setGroupFields(group) }.single()

        auditLogger.log(authenticatedUser.username, "Updated group: $groupId")
        return groupRow.toGroup()
    }

    fun getGroupsOfUser(authenticatedUser: AuthenticatedUser): List<Group> {
        val groupsQuery = when (authenticatedUser.isSuperUser) {
            true -> GroupsTable.selectAll()

            false ->
                UserGroupsTable
                    .join(
                        GroupsTable,
                        JoinType.LEFT,
                        additionalConstraint = {
                            (UserGroupsTable.groupIdColumn eq GroupsTable.id)
                        },
                    )
                    .selectAll()
                    .where { UserGroupsTable.userNameColumn eq authenticatedUser.username }
        }

        return groupsQuery.map { it.toGroup() }
    }

    fun getGroupIdsOfUser(authenticatedUser: AuthenticatedUser) = getGroupsOfUser(authenticatedUser).map { it.groupId }

    fun addUserToGroup(authenticatedUser: AuthenticatedUser, groupId: Int, usernameToAdd: String) {
        groupManagementPreconditionValidator.validateUserIsAllowedToModifyGroup(groupId, authenticatedUser)
        val user = groupManagementPreconditionValidator.validateThatUserExists(usernameToAdd)

        try {
            UserGroupsTable.insert {
                it[userNameColumn] = user.username
                it[groupIdColumn] = groupId
            }
            auditLogger.log(authenticatedUser.username, "Added ${user.username} to group $groupId")
        } catch (e: ExposedSQLException) {
            if (e.sqlState == UNIQUE_CONSTRAINT_VIOLATION_SQL_STATE) {
                throw ConflictException(
                    "User ${user.username} is already member of the group $groupId.",
                )
            }
            throw e
        }
    }

    fun removeUserFromGroup(authenticatedUser: AuthenticatedUser, groupId: Int, usernameToRemove: String) {
        groupManagementPreconditionValidator.validateUserIsAllowedToModifyGroup(groupId, authenticatedUser)

        UserGroupsTable.deleteWhere {
            (userNameColumn.lowerCase() eq usernameToRemove.lowercase()) and
                (groupIdColumn eq groupId)
        }
        auditLogger.log(authenticatedUser.username, "Removed $usernameToRemove from group $groupId")
    }

    fun getGroups(name: String?): List<Group> {
        val groupsQuery = if (name == null) {
            GroupsTable.selectAll()
        } else {
            GroupsTable.selectAll().where {
                // just case-insensitive perfect matches for now
                GroupsTable.groupNameColumn.lowerCase() eq name.lowercase()
            }
        }

        return groupsQuery.map { it.toGroup() }
    }

    private fun UpdateBuilder<*>.setGroupFields(group: NewGroup) {
        this[GroupsTable.groupNameColumn] = group.groupName
        this[GroupsTable.institutionColumn] = group.institution
        this[GroupsTable.addressLine1] = group.address.line1
        this[GroupsTable.addressLine2] = group.address.line2
        this[GroupsTable.addressPostalCode] = group.address.postalCode
        this[GroupsTable.addressCity] = group.address.city
        this[GroupsTable.addressState] = group.address.state
        this[GroupsTable.addressCountry] = group.address.country
        this[GroupsTable.contactEmailColumn] = group.contactEmail
    }

    private fun ResultRow.toGroup(hideEmail: Boolean = false): Group = Group(
        groupId = this[GroupsTable.id].value,
        groupName = this[GroupsTable.groupNameColumn],
        institution = this[GroupsTable.institutionColumn],
        address = Address(
            line1 = this[GroupsTable.addressLine1],
            line2 = this[GroupsTable.addressLine2],
            postalCode = this[GroupsTable.addressPostalCode],
            city = this[GroupsTable.addressCity],
            state = this[GroupsTable.addressState],
            country = this[GroupsTable.addressCountry],
        ),
        contactEmail = if (hideEmail) null else this[GroupsTable.contactEmailColumn],
    )
}
