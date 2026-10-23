package org.loculus.api.groups

import org.jetbrains.exposed.v1.core.ResultRow
import org.jetbrains.exposed.v1.core.dao.id.IntIdTable
import org.jetbrains.exposed.v1.core.statements.UpdateBuilder
import org.jetbrains.exposed.v1.javatime.datetime

// Mirrors tables created by the backend's Flyway migrations. Do not change them here without a backend migration.

object GroupsTable : IntIdTable("groups_table", "group_id") {
    val groupName = text("group_name")
    val institution = text("institution")
    val addressLine1 = text("address_line_1")
    val addressLine2 = text("address_line_2")
    val addressPostalCode = text("address_postal_code")
    val addressCity = text("address_city")
    val addressState = text("address_state")
    val addressCountry = text("address_country")
    val contactEmail = text("contact_email")
    val createdAt = datetime("created_at")
    val createdBy = text("created_by").nullable()
}

object UserGroupsTable : IntIdTable("user_groups_table", "id") {
    val userName = text("user_name")
    val groupId = integer("group_id").references(GroupsTable.id)
}

internal fun UpdateBuilder<*>.setGroupProperties(group: GroupInput) {
    this[GroupsTable.groupName] = group.groupName
    this[GroupsTable.institution] = group.institution
    this[GroupsTable.addressLine1] = group.address.line1
    this[GroupsTable.addressLine2] = group.address.line2
    this[GroupsTable.addressPostalCode] = group.address.postalCode
    this[GroupsTable.addressCity] = group.address.city
    this[GroupsTable.addressState] = group.address.state
    this[GroupsTable.addressCountry] = group.address.country
    this[GroupsTable.contactEmail] = group.contactEmail
}

internal fun ResultRow.toGroup(redactEmail: Boolean = false) = Group(
    groupId = this[GroupsTable.id].value,
    groupName = this[GroupsTable.groupName],
    institution = this[GroupsTable.institution],
    address = Address(
        line1 = this[GroupsTable.addressLine1],
        line2 = this[GroupsTable.addressLine2],
        postalCode = this[GroupsTable.addressPostalCode],
        city = this[GroupsTable.addressCity],
        state = this[GroupsTable.addressState],
        country = this[GroupsTable.addressCountry],
    ),
    contactEmail = if (redactEmail) null else this[GroupsTable.contactEmail],
)
