package org.loculus.backend.service.groupmanagement

import org.jetbrains.exposed.v1.core.JoinType
import org.jetbrains.exposed.v1.core.ResultRow
import org.jetbrains.exposed.v1.core.SortOrder
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.lowerCase
import org.jetbrains.exposed.v1.core.statements.UpdateBuilder
import org.jetbrains.exposed.v1.exceptions.ExposedSQLException
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.insertAndGetId
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.update
import org.loculus.backend.api.Address
import org.loculus.backend.api.Group
import org.loculus.backend.api.GroupDetails
import org.loculus.backend.api.NewGroup
import org.loculus.backend.api.User
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.controller.ConflictException
import org.loculus.backend.controller.NotFoundException
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.utils.DateProvider
import org.postgresql.util.PSQLState
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional
class GroupManagementDatabaseService(
    private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
    private val auditLogger: AuditLogger,
    private val dateProvider: DateProvider,
) {

    fun getDetailsOfGroup(groupId: Int, user: org.loculus.backend.auth.User): GroupDetails = GroupDetails(
        group = getGroup(groupId, user),
        users = if (user is AuthenticatedUser) getMembers(groupId) else null,
    )

    fun getGroup(groupId: Int, user: org.loculus.backend.auth.User): Group =
        findGroup(groupId, redactEmail = user !is AuthenticatedUser)

    fun getMembers(groupId: Int): List<User> {
        findGroup(groupId)
        return UserGroupsTable.selectAll()
            .where { UserGroupsTable.groupIdColumn eq groupId }
            .orderBy(UserGroupsTable.id to SortOrder.ASC)
            .map { User(it[UserGroupsTable.userNameColumn]) }
    }

    fun createNewGroup(group: NewGroup, authenticatedUser: AuthenticatedUser): Group {
        val groupId = GroupsTable.insertAndGetId {
            it.setGroupProperties(group)
            it[createdBy] = authenticatedUser.username
            it[createdAt] = dateProvider.getCurrentDateTime()
        }.value

        UserGroupsTable.insert {
            it[userNameColumn] = authenticatedUser.username
            it[groupIdColumn] = groupId
        }

        auditLogger.log(authenticatedUser.username, "Created group: $groupId with groupName ${group.groupName}")

        return findGroup(groupId)
    }

    fun updateGroup(groupId: Int, group: NewGroup, authenticatedUser: AuthenticatedUser): Group {
        groupManagementPreconditionValidator.validateThatUserExists(authenticatedUser.username)

        groupManagementPreconditionValidator.validateUserIsAllowedToModifyGroup(groupId, authenticatedUser)

        GroupsTable.update({ GroupsTable.id eq groupId }) { it.setGroupProperties(group) }

        auditLogger.log(authenticatedUser.username, "Updated group: $groupId")

        return findGroup(groupId)
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
        }.orderBy(GroupsTable.id to SortOrder.ASC)

        return groupsQuery.map { it.toGroup() }
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
            if (e.sqlState == PSQLState.UNIQUE_VIOLATION.state) {
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

    fun getGroups(name: String?): List<Group> = GroupsTable.selectAll()
        .apply {
            // just case-insensitive perfect matches for now
            if (name != null) where { GroupsTable.groupNameColumn.lowerCase() eq name.lowercase() }
        }
        .orderBy(GroupsTable.id to SortOrder.ASC)
        .map { it.toGroup() }

    private fun findGroup(groupId: Int, redactEmail: Boolean = false): Group = GroupsTable.selectAll()
        .where { GroupsTable.id eq groupId }
        .singleOrNull()
        ?.toGroup(redactEmail)
        ?: throw NotFoundException("Group $groupId does not exist.")

    private fun UpdateBuilder<*>.setGroupProperties(group: NewGroup) {
        this[GroupsTable.groupNameColumn] = group.groupName
        this[GroupsTable.institutionColumn] = group.institution
        this[GroupsTable.addressLine1] = group.address.line1
        this[GroupsTable.addressLine2] = group.address.line2
        this[GroupsTable.addressPostalCode] = group.address.postalCode
        this[GroupsTable.addressState] = group.address.state
        this[GroupsTable.addressCity] = group.address.city
        this[GroupsTable.addressCountry] = group.address.country
        this[GroupsTable.contactEmailColumn] = group.contactEmail
    }

    private fun ResultRow.toGroup(redactEmail: Boolean = false): Group = Group(
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
        contactEmail = if (redactEmail) null else this[GroupsTable.contactEmailColumn],
    )
}
