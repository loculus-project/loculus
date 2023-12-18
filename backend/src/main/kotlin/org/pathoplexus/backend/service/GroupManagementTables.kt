package org.pathoplexus.backend.service

import org.jetbrains.exposed.sql.Table

object GroupsTable : Table("groups_table") {
    val groupNameColumn = text("group_name")

    override val primaryKey = PrimaryKey(groupNameColumn)
}

object UserGroupsTable : Table("user_groups_table") {
    val userNameColumn = text("user_name")
    val groupNameColumn = text("group_name") references GroupsTable.groupNameColumn

    override val primaryKey = PrimaryKey(userNameColumn, groupNameColumn)
}

data class Group(
    val groupName: String,
)

data class User(
    val name: String,
)
