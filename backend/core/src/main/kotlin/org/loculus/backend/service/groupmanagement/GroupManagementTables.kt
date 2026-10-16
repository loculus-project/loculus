package org.loculus.backend.service.groupmanagement

import org.jetbrains.exposed.v1.core.dao.id.IntIdTable
import org.jetbrains.exposed.v1.datetime.datetime

const val GROUPS_TABLE_NAME = "groups_table"
const val USER_GROUPS_TABLE_NAME = "user_groups_table"

object GroupsTable : IntIdTable(GROUPS_TABLE_NAME, "group_id") {
    val groupNameColumn = text("group_name")
    val institutionColumn = text("institution")
    val addressLine1 = text("address_line_1")
    val addressLine2 = text("address_line_2")
    val addressPostalCode = text("address_postal_code")
    val addressCity = text("address_city")
    val addressState = text("address_state")
    val addressCountry = text("address_country")
    val contactEmailColumn = text("contact_email")
    val createdAt = datetime("created_at")
    val createdBy = text("created_by").nullable()
}

object UserGroupsTable : IntIdTable(USER_GROUPS_TABLE_NAME, "id") {
    val userNameColumn = text("user_name")
    val groupIdColumn = integer("group_id").references(GroupsTable.id)
}
