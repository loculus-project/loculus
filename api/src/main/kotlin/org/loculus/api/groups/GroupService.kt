package org.loculus.api.groups

import org.jetbrains.exposed.v1.core.JoinType
import org.jetbrains.exposed.v1.core.SortOrder
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.lowerCase
import org.jetbrains.exposed.v1.exceptions.ExposedSQLException
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.insertAndGetId
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.update
import org.loculus.api.audit.AuditLogger
import org.loculus.api.auth.AuthenticatedUser
import org.loculus.api.auth.User
import org.loculus.api.error.ConflictException
import org.loculus.api.error.ForbiddenException
import org.loculus.api.error.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.LocalDateTime

private const val UNIQUE_CONSTRAINT_VIOLATION_SQL_STATE = "23505"

@Service
@Transactional
class GroupService(
    private val userDirectory: UserDirectory,
    private val auditLogger: AuditLogger,
    private val clock: Clock,
) {
    @Transactional(readOnly = true)
    fun getGroups(name: String?): List<Group> = GroupsTable.selectAll()
        .apply {
            // Case-insensitive exact match
            if (name != null) where { GroupsTable.groupName.lowerCase() eq name.lowercase() }
        }
        .orderBy(GroupsTable.id to SortOrder.ASC)
        .map { it.toGroup() }

    @Transactional(readOnly = true)
    fun getGroup(groupId: Int, user: User): Group = findGroup(groupId, redactEmail = user !is AuthenticatedUser)

    @Transactional(readOnly = true)
    fun getMembers(groupId: Int): List<GroupMember> {
        requireGroupExists(groupId)
        return UserGroupsTable.selectAll()
            .where { UserGroupsTable.groupId eq groupId }
            .orderBy(UserGroupsTable.id to SortOrder.ASC)
            .map { GroupMember(it[UserGroupsTable.userName]) }
    }

    @Transactional(readOnly = true)
    fun getGroupsOfUser(user: AuthenticatedUser): List<Group> {
        if (user.isSuperUser) {
            return getGroups(name = null)
        }
        return UserGroupsTable
            .join(GroupsTable, JoinType.INNER, UserGroupsTable.groupId, GroupsTable.id)
            .selectAll()
            .where { UserGroupsTable.userName eq user.username }
            .orderBy(GroupsTable.id to SortOrder.ASC)
            .map { it.toGroup() }
    }

    fun createGroup(group: GroupInput, user: AuthenticatedUser): Group {
        val groupId = GroupsTable.insertAndGetId {
            it.setGroupProperties(group)
            it[createdBy] = user.username
            it[createdAt] = LocalDateTime.now(clock)
        }.value

        UserGroupsTable.insert {
            it[userName] = user.username
            it[this.groupId] = groupId
        }

        auditLogger.log(user.username, "Created group: $groupId with groupName ${group.groupName}")

        return findGroup(groupId)
    }

    fun updateGroup(groupId: Int, group: GroupInput, user: AuthenticatedUser): Group {
        requireMayModifyGroup(groupId, user)

        GroupsTable.update({ GroupsTable.id eq groupId }) { it.setGroupProperties(group) }

        auditLogger.log(user.username, "Updated group: $groupId")

        return findGroup(groupId)
    }

    fun addMember(groupId: Int, usernameToAdd: String, user: AuthenticatedUser) {
        requireMayModifyGroup(groupId, user)
        if (!userDirectory.userExists(usernameToAdd)) {
            throw NotFoundException("User $usernameToAdd does not exist.")
        }

        try {
            UserGroupsTable.insert {
                it[userName] = usernameToAdd
                it[this.groupId] = groupId
            }
        } catch (e: ExposedSQLException) {
            if (e.sqlState == UNIQUE_CONSTRAINT_VIOLATION_SQL_STATE) {
                throw ConflictException("User $usernameToAdd is already a member of group $groupId.")
            }
            throw e
        }

        auditLogger.log(user.username, "Added $usernameToAdd to group $groupId")
    }

    fun removeMember(groupId: Int, usernameToRemove: String, user: AuthenticatedUser) {
        requireMayModifyGroup(groupId, user)

        UserGroupsTable.deleteWhere {
            (UserGroupsTable.userName eq usernameToRemove) and (UserGroupsTable.groupId eq groupId)
        }

        auditLogger.log(user.username, "Removed $usernameToRemove from group $groupId")
    }

    private fun findGroup(groupId: Int, redactEmail: Boolean = false): Group = GroupsTable.selectAll()
        .where { GroupsTable.id eq groupId }
        .singleOrNull()
        ?.toGroup(redactEmail)
        ?: throw NotFoundException("Group $groupId does not exist.")

    private fun requireGroupExists(groupId: Int) {
        findGroup(groupId)
    }

    private fun requireMayModifyGroup(groupId: Int, user: AuthenticatedUser) {
        requireGroupExists(groupId)
        if (user.isSuperUser) {
            return
        }
        val isMember = UserGroupsTable.selectAll()
            .where { (UserGroupsTable.groupId eq groupId) and (UserGroupsTable.userName eq user.username) }
            .any()
        if (!isMember) {
            throw ForbiddenException("User ${user.username} is not a member of group $groupId. Action not allowed.")
        }
    }
}
