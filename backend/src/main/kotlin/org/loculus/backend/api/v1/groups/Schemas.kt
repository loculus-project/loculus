package org.loculus.backend.api.v1.groups

import io.swagger.v3.oas.annotations.media.Schema

data class GroupAddress(
    @Schema(description = "The first line of the address.", example = "1234 Loculus Street")
    val line1: String,
    @Schema(description = "The second line of the address.", example = "Apt 1")
    val line2: String,
    @Schema(description = "The city of the address.", example = "Dortmund")
    val city: String,
    @Schema(description = "The state of the address.", example = "NRW")
    val state: String,
    @Schema(description = "The postal code of the address.", example = "12345")
    val postalCode: String,
    @Schema(description = "The country of the address.", example = "Germany")
    val country: String,
)

data class GroupRequest(
    @Schema(description = "The display name of the group.", example = "Example Group")
    val groupName: String,
    @Schema(description = "The name of the institution.", example = "University of Loculus")
    val institution: String,
    @Schema(description = "The address of the institution.")
    val address: GroupAddress,
    @Schema(description = "The contact email for the group.", example = "something@loculus.org")
    val contactEmail: String,
)

data class GroupResponse(
    @Schema(description = "The id of the group.", example = "123")
    val groupId: Int,
    @Schema(description = "The display name of the group.", example = "Example Group")
    val groupName: String,
    @Schema(description = "The name of the institution.", example = "University of Loculus")
    val institution: String,
    @Schema(description = "The address of the institution.")
    val address: GroupAddress,
    @Schema(
        description = "The contact email for the group. Will be `null` if not authenticated.",
        example = "something@loculus.org",
    )
    val contactEmail: String?,
)

data class GroupMemberResponse(
    @Schema(description = "The username of the member.", example = "testuser")
    val username: String,
)
