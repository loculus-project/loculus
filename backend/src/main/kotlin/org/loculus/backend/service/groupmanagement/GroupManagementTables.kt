package org.loculus.backend.service.groupmanagement

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.core.dao.id.IntIdTable
import org.jetbrains.exposed.v1.dao.IntEntity
import org.jetbrains.exposed.v1.dao.IntEntityClass
import org.jetbrains.exposed.v1.datetime.datetime

const val GROUPS_TABLE_NAME = "groups_table"
const val USER_GROUPS_TABLE_NAME = "user_groups_table"

object GroupsTable : IntIdTable(GROUPS_TABLE_NAME, "group_id") {
    val groupNameColumn = varchar("group_name", 255)
    val institutionColumn = varchar("institution", 255)
    val addressLine1 = varchar("address_line_1", 255)
    val addressLine2 = varchar("address_line_2", 255)
    val addressPostalCode = varchar("address_postal_code", 255)
    val addressCity = varchar("address_city", 255)
    val addressState = varchar("address_state", 255)
    val addressCountry = varchar("address_country", 255)
    val contactEmailColumn = varchar("contact_email", 255)
    val createdAt = datetime("created_at")
    val createdBy = text("created_by").nullable()
}

class GroupEntity(id: EntityID<Int>) : IntEntity(id) {
    companion object : IntEntityClass<GroupEntity>(GroupsTable)

    var groupName by GroupsTable.groupNameColumn
    var institution by GroupsTable.institutionColumn
    var addressLine1 by GroupsTable.addressLine1
    var addressLine2 by GroupsTable.addressLine2
    var addressPostalCode by GroupsTable.addressPostalCode
    var addressCity by GroupsTable.addressCity
    var addressState by GroupsTable.addressState
    var addressCountry by GroupsTable.addressCountry
    var contactEmail by GroupsTable.contactEmailColumn
    var createdAt by GroupsTable.createdAt
    var createdBy by GroupsTable.createdBy
}

object UserGroupsTable : IntIdTable(USER_GROUPS_TABLE_NAME, "id") {
    val userNameColumn = text("user_name")
    val groupIdColumn = integer("group_id").references(GroupsTable.id)
}
