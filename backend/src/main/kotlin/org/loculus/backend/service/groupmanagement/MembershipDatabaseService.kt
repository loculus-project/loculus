package org.loculus.backend.service.groupmanagement

import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.isNull
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.update
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

data class MembershipLink(val id: Int, val groupId: Int, val username: String, val userId: UUID?)

@Service
class MembershipDatabaseService {
    /** Shared persistence for v0 and future v1 callers; authorize and resolve identity first. */
    @Transactional
    fun insert(groupId: Int, userId: UUID, legacyUsername: String) {
        UserGroupsTable.insert {
            it[userNameColumn] = legacyUsername
            it[userIdColumn] = userId
            it[groupIdColumn] = groupId
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    fun read(): List<MembershipLink> = UserGroupsTable.selectAll().orderBy(UserGroupsTable.id).map {
        MembershipLink(
            it[UserGroupsTable.id].value,
            it[UserGroupsTable.groupIdColumn],
            it[UserGroupsTable.userNameColumn],
            it[UserGroupsTable.userIdColumn],
        )
    }

    /** Recheck after planning: never resurrect removed rows or overwrite a concurrently established link. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun link(expected: MembershipLink, userId: UUID): String {
        val current = UserGroupsTable.selectAll().where { UserGroupsTable.id eq expected.id }.forUpdate()
            .singleOrNull() ?: return "removed_during_run"
        if (current[UserGroupsTable.userNameColumn] != expected.username ||
            current[UserGroupsTable.groupIdColumn] != expected.groupId
        ) {
            return "changed_during_run"
        }
        val existing = current[UserGroupsTable.userIdColumn]
        if (existing != null) return if (existing == userId) "already_linked" else "identity_conflict"
        val updated = UserGroupsTable.update({
            (UserGroupsTable.id eq expected.id) and UserGroupsTable.userIdColumn.isNull()
        }) { it[userIdColumn] = userId }
        check(updated == 1)
        return "linked"
    }
}
