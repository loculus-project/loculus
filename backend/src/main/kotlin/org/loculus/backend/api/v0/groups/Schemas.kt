package org.loculus.backend.api.v0.groups

import io.swagger.v3.oas.annotations.media.Schema
import org.loculus.backend.types.Address
import org.loculus.backend.types.Group
import org.loculus.backend.types.MAX_GROUP_FIELD_LENGTH
import org.loculus.backend.types.NewGroup
import org.loculus.backend.types.User

@Schema(name = "Address")
data class V0Address(
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
        fun from(address: Address): V0Address = V0Address(
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
data class V0NewGroup(
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
    val address: V0Address,
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
data class V0Group(
    @Schema(description = "The id of the group.", example = "123")
    val groupId: Int,
    @Schema(description = "The display name of the group.", example = "Example Group")
    val groupName: String,
    @Schema(description = "The name of the institution.", example = "University of Loculus")
    val institution: String,
    @Schema(description = "The address of the institution.")
    val address: V0Address,
    @Schema(
        description = "The contact email for the group. Will be `null` if not authenticated.",
        example = "something@loculus.org",
    )
    val contactEmail: String?,
) {
    companion object {
        fun from(group: Group): V0Group = V0Group(
            groupId = group.groupId,
            groupName = group.groupName,
            institution = group.institution,
            address = V0Address.from(group.address),
            contactEmail = group.contactEmail,
        )
    }
}

@Schema(name = "User")
data class V0User(val name: String) {
    companion object {
        fun from(user: User): V0User = V0User(name = user.name)
    }
}

@Schema(name = "GroupDetails")
data class V0GroupDetails(val group: V0Group, val users: List<V0User>?) {
    companion object {
        fun from(group: Group, users: List<User>?): V0GroupDetails = V0GroupDetails(
            group = V0Group.from(group),
            users = users?.map(V0User::from),
        )
    }
}
