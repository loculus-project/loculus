package org.loculus.backend.types

import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.Size

const val MAX_GROUP_FIELD_LENGTH = 255

data class Address(
    @field:Size(max = MAX_GROUP_FIELD_LENGTH)
    @Schema(description = "The first line of the address.", example = "1234 Loculus Street")
    val line1: String,
    @field:Size(max = MAX_GROUP_FIELD_LENGTH)
    @Schema(description = "The second line of the address.", example = "Apt 1")
    val line2: String,
    @field:Size(max = MAX_GROUP_FIELD_LENGTH)
    @Schema(description = "The city of the address.", example = "Dortmund")
    val city: String,
    @field:Size(max = MAX_GROUP_FIELD_LENGTH)
    @Schema(description = "The state of the address.", example = "NRW")
    val state: String,
    @field:Size(max = MAX_GROUP_FIELD_LENGTH)
    @Schema(description = "The postal code of the address.", example = "12345")
    val postalCode: String,
    @field:Size(max = MAX_GROUP_FIELD_LENGTH)
    @Schema(description = "The country of the address.", example = "Germany")
    val country: String,
)

data class NewGroup(
    @field:Size(max = MAX_GROUP_FIELD_LENGTH)
    @Schema(description = "The display name of the group.", example = "Example Group")
    val groupName: String,
    @field:Size(max = MAX_GROUP_FIELD_LENGTH)
    @Schema(description = "The name of the institution.", example = "University of Loculus")
    val institution: String,
    @field:Valid
    @Schema(description = "The address of the institution.")
    val address: Address,
    @field:Size(max = MAX_GROUP_FIELD_LENGTH)
    @Schema(description = "The contact email for the group.", example = "something@loculus.org")
    val contactEmail: String,
)

data class Group(
    @Schema(description = "The id of the group.", example = "123")
    val groupId: Int,
    @Schema(description = "The display name of the group.", example = "Example Group")
    val groupName: String,
    @Schema(description = "The name of the institution.", example = "University of Loculus")
    val institution: String,
    @Schema(description = "The address of the institution.")
    val address: Address,
    @Schema(
        description = "The contact email for the group. Will be `null` if not authenticated.",
        example = "something@loculus.org",
    )
    val contactEmail: String?,
)

data class User(val name: String)

data class GroupDetails(val group: Group, val users: List<User>?)
