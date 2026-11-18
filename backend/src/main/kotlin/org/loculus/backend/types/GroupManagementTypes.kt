package org.loculus.backend.types

import jakarta.validation.Valid
import jakarta.validation.constraints.Size

const val MAX_GROUP_FIELD_LENGTH = 255

data class Address(
    @field:Size(max = MAX_GROUP_FIELD_LENGTH)
    val line1: String,
    @field:Size(max = MAX_GROUP_FIELD_LENGTH)
    val line2: String,
    @field:Size(max = MAX_GROUP_FIELD_LENGTH)
    val city: String,
    @field:Size(max = MAX_GROUP_FIELD_LENGTH)
    val state: String,
    @field:Size(max = MAX_GROUP_FIELD_LENGTH)
    val postalCode: String,
    @field:Size(max = MAX_GROUP_FIELD_LENGTH)
    val country: String,
)

data class NewGroup(
    @field:Size(max = MAX_GROUP_FIELD_LENGTH)
    val groupName: String,
    @field:Size(max = MAX_GROUP_FIELD_LENGTH)
    val institution: String,
    @field:Valid
    val address: Address,
    @field:Size(max = MAX_GROUP_FIELD_LENGTH)
    val contactEmail: String,
)

data class Group(
    val groupId: Int,
    val groupName: String,
    val institution: String,
    val address: Address,
    val contactEmail: String?,
)

data class User(val name: String)
