package org.loculus.backend.service.groupmanagement

import org.jetbrains.exposed.sql.Table

const val GROUPS_TABLE_NAME = "groups_table"
const val USER_GROUPS_TABLE_NAME = "user_groups_table"

object GroupsTable : Table("groups_table") {
    val groupNameColumn = text("group_name")

    override val primaryKey = PrimaryKey(groupNameColumn)
}

object UserGroupsTable : Table(USER_GROUPS_TABLE_NAME) {
    val userNameColumn = text("user_name")
    val groupNameColumn = text("group_name") references GroupsTable.groupNameColumn

    override val primaryKey = PrimaryKey(userNameColumn, groupNameColumn)
}
