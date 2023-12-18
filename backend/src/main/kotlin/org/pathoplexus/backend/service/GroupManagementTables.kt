package org.pathoplexus.backend.service

import org.jetbrains.exposed.sql.Table

object GroupsTable : Table("groups_table") {
    val groupName = text("group_name")

    override val primaryKey = PrimaryKey(groupName)
}

object UserGroupsTable : Table("user_groups_table") {
    val userName = text("user_name")
    val groupName = text("group_name") references GroupsTable.groupName

    override val primaryKey = PrimaryKey(userName, groupName)
}

data class Group(
    val groupName: String,
)

data class User(
    val name: String,
)
