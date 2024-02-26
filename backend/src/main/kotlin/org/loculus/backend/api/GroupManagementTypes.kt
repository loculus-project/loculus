package org.loculus.backend.api

import io.swagger.v3.oas.annotations.media.Schema

data class Address(
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

data class Group(
    @Schema(description = "The name of the group.", example = "Group1")
    val groupName: String,
    @Schema(description = "The name of the institution.", example = "University of Loculus")
    val institution: String,
    @Schema(description = "The address of the institution.")
    val address: Address,
    @Schema(description = "The contact email for the group.", example = "something@loculus.org")
    val contactEmail: String,
)
data class User(
    val name: String,
)

data class GroupDetails(
    val group: Group,
    val users: List<User>,
)
