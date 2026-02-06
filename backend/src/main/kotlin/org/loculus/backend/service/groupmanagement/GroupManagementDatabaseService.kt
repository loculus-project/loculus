package org.loculus.backend.service.groupmanagement

import org.jetbrains.exposed.exceptions.ExposedSQLException
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.lowerCase
import org.jetbrains.exposed.sql.selectAll
import org.loculus.backend.api.Address
import org.loculus.backend.api.Group
import org.loculus.backend.api.GroupDetails
import org.loculus.backend.api.NewGroup
import org.loculus.backend.api.User
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.controller.ConflictException
import org.loculus.backend.controller.NotFoundException
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.model.UNIQUE_CONSTRAINT_VIOLATION_SQL_STATE
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

    fun getDetailsOfGroup(groupId: Int, user: org.loculus.backend.auth.User): GroupDetails {
        val groupEntity = GroupEntity.findById(groupId) ?: throw NotFoundException("Group $groupId does not exist.")

        return when (user is AuthenticatedUser) {
            true -> {
                val users = UserGroupEntity.find { UserGroupsTable.groupIdColumn eq groupId }
                GroupDetails(
                    group = groupEntity.toGroup(),
                    users = users.map { User(it.userName) },
                )
            }

            false ->
                GroupDetails(
                    group = groupEntity.toGroup(redactEmail = true),
                    users = null,
                )
        }
    }

    fun createNewGroup(group: NewGroup, authenticatedUser: AuthenticatedUser): Group {
        val groupEntity = GroupEntity.new {
            createdBy = authenticatedUser.username
            createdAt = dateProvider.getCurrentDateTime()
            this.updateWith(group)
        }

        val groupId = groupEntity.id.value

        UserGroupEntity.new {
            userName = authenticatedUser.username
            this.groupId = groupId
        }

        auditLogger.log(authenticatedUser.username, "Created group: $groupId with groupName ${group.groupName}")

        return groupEntity.toGroup()
    }

    fun updateGroup(groupId: Int, group: NewGroup, authenticatedUser: AuthenticatedUser): Group {
        groupManagementPreconditionValidator.validateThatUserExists(authenticatedUser.username)

        groupManagementPreconditionValidator.validateUserIsAllowedToModifyGroup(groupId, authenticatedUser)

        val groupEntity = GroupEntity.findById(groupId) ?: throw NotFoundException("Group $groupId does not exist.")

        groupEntity.updateWith(group)

        auditLogger.log(authenticatedUser.username, "Updated group: $groupId")

        return groupEntity.toGroup()
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

        return groupsQuery.map {
            Group(
                groupId = it[GroupsTable.id].value,
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

    fun getGroupIdsOfUser(authenticatedUser: AuthenticatedUser) = getGroupsOfUser(authenticatedUser).map { it.groupId }

    fun addUserToGroup(authenticatedUser: AuthenticatedUser, groupId: Int, usernameToAdd: String) {
        groupManagementPreconditionValidator.validateThatUserExists(usernameToAdd)

        groupManagementPreconditionValidator.validateUserIsAllowedToModifyGroup(groupId, authenticatedUser)

        try {
            UserGroupsTable.insert {
                it[userNameColumn] = usernameToAdd
                it[groupIdColumn] = groupId
            }
            auditLogger.log(authenticatedUser.username, "Added $usernameToAdd to group $groupId")
        } catch (e: ExposedSQLException) {
            if (e.sqlState == UNIQUE_CONSTRAINT_VIOLATION_SQL_STATE) {
                throw ConflictException(
                    "User $usernameToAdd is already member of the group $groupId.",
                )
            }
            throw e
        }
    }

    fun removeUserFromGroup(authenticatedUser: AuthenticatedUser, groupId: Int, usernameToRemove: String) {
        groupManagementPreconditionValidator.validateUserIsAllowedToModifyGroup(groupId, authenticatedUser)

        UserGroupsTable.deleteWhere {
            (userNameColumn eq usernameToRemove) and
                (groupIdColumn eq groupId)
        }
        auditLogger.log(authenticatedUser.username, "Removed $usernameToRemove from group $groupId")
    }

    fun getGroups(name: String?): List<Group> {
        val entities = if (name == null) {
            GroupEntity.all()
        } else {
            GroupEntity.find {
                // just case-insensitive perfect matches for now
                GroupsTable.groupNameColumn.lowerCase() eq name.lowercase()
            }
        }

        return entities.map { it.toGroup() }
    }

    private fun GroupEntity.updateWith(group: NewGroup) {
        groupName = group.groupName
        institution = group.institution
        addressLine1 = group.address.line1
        addressLine2 = group.address.line2
        addressPostalCode = group.address.postalCode
        addressState = group.address.state
        addressCity = group.address.city
        addressCountry = group.address.country
        contactEmail = group.contactEmail
    }

    private fun GroupEntity.toGroup(redactEmail: Boolean = false): Group = Group(
        groupId = this.id.value,
        groupName = this.groupName,
        institution = this.institution,
        address = Address(
            line1 = this.addressLine1,
            line2 = this.addressLine2,
            postalCode = this.addressPostalCode,
            city = this.addressCity,
            state = this.addressState,
            country = this.addressCountry,
        ),
        contactEmail = if (redactEmail) null else this.contactEmail,
    )
}
