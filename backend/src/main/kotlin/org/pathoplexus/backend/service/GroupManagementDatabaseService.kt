package org.pathoplexus.backend.service

import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.select
import org.pathoplexus.backend.controller.BadRequestException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional
class GroupManagementDatabaseService {

    fun createNewGroup(groupName: String, username: String) {
        val groupEntity = GroupsTable.select { GroupsTable.groupNameColumn eq groupName }
            .singleOrNull()

        if (groupEntity != null) {
            throw BadRequestException("Group already exists")
        }

        GroupsTable.insert {
            it[GroupsTable.groupNameColumn] = groupName
        }

        UserGroupsTable.insert {
            it[UserGroupsTable.userNameColumn] = username
            it[UserGroupsTable.groupNameColumn] = groupName
        }
    }
}
