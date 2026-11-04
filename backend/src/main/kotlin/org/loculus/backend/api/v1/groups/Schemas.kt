package org.loculus.backend.api.v1.groups

import io.swagger.v3.oas.annotations.media.Schema
import org.loculus.backend.types.Address
import org.loculus.backend.types.Group
import org.loculus.backend.types.MAX_GROUP_FIELD_LENGTH
import org.loculus.backend.types.NewGroup
import org.loculus.backend.types.User

@Schema(name = "Address")
data class V1Address(
    @Schema(
        description = "The first line of the address.",
        example = "1234 Loculus Street",
        maxLength = MAX_GROUP_FIELD_LENGTH,
    )
    val line1: String,
    @Schema(description = "The second line of the address.", example = "Apt 1", maxLength = MAX_GROUP_FIELD_LENGTH)
    val line2: String,
    @Schema(description = "The city of the address.", example = "Dortmund", maxLength = MAX_GROUP_FIELD_LENGTH)
    val city: String,
    @Schema(description = "The state of the address.", example = "NRW", maxLength = MAX_GROUP_FIELD_LENGTH)
    val state: String,
    @Schema(description = "The postal code of the address.", example = "12345", maxLength = MAX_GROUP_FIELD_LENGTH)
    val postalCode: String,
    @Schema(description = "The country of the address.", example = "Germany", maxLength = MAX_GROUP_FIELD_LENGTH)
    val country: String,
) {
    fun toServiceAddress(): Address = Address(
        line1 = line1,
        line2 = line2,
        city = city,
        state = state,
        postalCode = postalCode,
        country = country,
    )

    companion object {
        fun from(address: Address): V1Address = V1Address(
            line1 = address.line1,
            line2 = address.line2,
            city = address.city,
            state = address.state,
            postalCode = address.postalCode,
            country = address.country,
        )
    }
}

@Schema(name = "NewGroup")
data class V1NewGroup(
    @Schema(
        description = "The display name of the group.",
        example = "Example Group",
        maxLength = MAX_GROUP_FIELD_LENGTH,
    )
    val groupName: String,
    @Schema(
        description = "The name of the institution.",
        example = "University of Loculus",
        maxLength = MAX_GROUP_FIELD_LENGTH,
    )
    val institution: String,
    @Schema(description = "The address of the institution.")
    val address: V1Address,
    @Schema(
        description = "The contact email for the group.",
        example = "something@loculus.org",
        maxLength = MAX_GROUP_FIELD_LENGTH,
    )
    val contactEmail: String,
) {
    fun toServiceNewGroup(): NewGroup = NewGroup(
        groupName = groupName,
        institution = institution,
        address = address.toServiceAddress(),
        contactEmail = contactEmail,
    )
}

@Schema(name = "Group")
data class V1Group(
    @Schema(description = "The ID of the group.", example = "123")
    val groupId: Int,
    @Schema(description = "The display name of the group.", example = "Example Group")
    val groupName: String,
    @Schema(description = "The name of the institution.", example = "University of Loculus")
    val institution: String,
    @Schema(description = "The address of the institution.")
    val address: V1Address,
    @Schema(
        description = "The contact email for the group. Will be `null` if not authenticated.",
        example = "something@loculus.org",
    )
    val contactEmail: String?,
) {
    companion object {
        fun from(group: Group): V1Group = V1Group(
            groupId = group.groupId,
            groupName = group.groupName,
            institution = group.institution,
            address = V1Address.from(group.address),
            contactEmail = group.contactEmail,
        )
    }
}

@Schema(name = "GroupUser")
data class V1GroupUser(val username: String) {
    companion object {
        fun from(user: User): V1GroupUser = V1GroupUser(username = user.name)
    }
}
