package org.loculus.backend.service.groupmanagement

import org.jetbrains.exposed.sql.Table

const val GROUPS_TABLE_NAME = "groups_table"
const val USER_GROUPS_TABLE_NAME = "user_groups_table"

object GroupsTable : Table("groups_table") {
    val groupNameColumn = text("group_name")
    val institutionColumn = text("institution")
    val addressLine1 = text("address_line_1")
    val addressLine2 = text("address_line_2")
    val addressPostalCode = text("address_postal_code")
    val addressCity = text("address_city")
    val addressState = text("address_state")
    val addressCountry = text("address_country")
    val contactEmailColumn = text("contact_email")

    override val primaryKey = PrimaryKey(groupNameColumn)
}

object UserGroupsTable : Table(USER_GROUPS_TABLE_NAME) {
    val userNameColumn = text("user_name")
    val groupNameColumn = text("group_name") references GroupsTable.groupNameColumn

    override val primaryKey = PrimaryKey(userNameColumn, groupNameColumn)
}
