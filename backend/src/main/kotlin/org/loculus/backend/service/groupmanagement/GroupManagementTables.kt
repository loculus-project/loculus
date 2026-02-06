package org.loculus.backend.service.groupmanagement

import org.jetbrains.exposed.dao.IntEntity
import org.jetbrains.exposed.dao.IntEntityClass
import org.jetbrains.exposed.dao.id.EntityID
import org.jetbrains.exposed.dao.id.IntIdTable
import org.jetbrains.exposed.sql.kotlin.datetime.datetime

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

class UserGroupEntity(id: EntityID<Int>) : IntEntity(id) {
    companion object : IntEntityClass<UserGroupEntity>(UserGroupsTable)

    var userName by UserGroupsTable.userNameColumn
    var groupId by UserGroupsTable.groupIdColumn
}
