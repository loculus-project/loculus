package org.loculus.backend.api.v1.groups

import com.fasterxml.jackson.annotation.JsonAnySetter
import com.fasterxml.jackson.databind.JsonNode
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

/** Scoped to these request types: do not change the legacy endpoints' Jackson configuration. */
abstract class StrictGroupRequest {
    @JsonAnySetter
    fun rejectUnknownField(name: String, value: JsonNode?): Unit =
        throw IllegalArgumentException("Unknown field in v1 group request.")
}

@Schema(
    description = "Fields accepted when creating a group. Creator and membership are derived " +
        "from the authenticated caller.",
    additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
    requiredProperties = ["groupName", "institution", "address", "contactEmail"],
)
data class CreateGroupRequest(
    @field:Schema(description = "Nonblank group name. Names need not be unique.")
    @field:NotBlank
    @field:Size(min = 1, max = 255)
    val groupName: String,
    @field:NotBlank @field:Size(min = 1, max = 255)
    val institution: String,
    @field:Valid
    val address: GroupAddressRequest,
    @field:NotBlank @field:Email @field:Size(min = 1, max = 255)
    @field:Schema(description = "Nonblank contact email address.", format = "email")
    val contactEmail: String,
) : StrictGroupRequest()

@Schema(
    description = "Group address. Required fields must contain non-whitespace text.",
    additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
    requiredProperties = ["line1", "postalCode", "city", "country"],
)
data class GroupAddressRequest(
    @field:NotBlank @field:Size(min = 1, max = 255)
    val line1: String,
    @field:Size(max = 255)
    @field:Schema(
        description = "Optional second address line; defaults to empty.",
        requiredMode = Schema.RequiredMode.NOT_REQUIRED,
    )
    val line2: String = "",
    @field:NotBlank @field:Size(min = 1, max = 255)
    val postalCode: String,
    @field:NotBlank @field:Size(min = 1, max = 255)
    val city: String,
    @field:Size(max = 255)
    @field:Schema(
        description = "Optional state or region; defaults to empty.",
        requiredMode = Schema.RequiredMode.NOT_REQUIRED,
    )
    val state: String = "",
    @field:NotBlank @field:Size(min = 1, max = 255)
    val country: String,
) : StrictGroupRequest()

data class GroupAddressResponse(
    val line1: String,
    val line2: String,
    val postalCode: String,
    val city: String,
    val state: String,
    val country: String,
)

data class GroupResponse(
    @field:Schema(description = "Group ID.", minimum = "1")
    val groupId: Int,
    val groupName: String,
    val institution: String,
    val address: GroupAddressResponse,
    val contactEmail: String?,
)

data class GroupDetailsResponse(
    @field:Schema(description = "Group ID.", minimum = "1")
    val groupId: Int,
    val groupName: String,
    val institution: String,
    val address: GroupAddressResponse,
    @field:Schema(description = "Contact email; null for anonymous callers.", format = "email", nullable = true)
    val contactEmail: String?,
    /** Temporary legacy identifier; migrate member identifiers to Loculus UUIDs before v1 launches. */
    @field:Schema(
        description = "Members; null for anonymous callers. Currently identified by legacy usernames.",
        nullable = true,
    )
    val members: List<GroupMemberResponse>?,
)

data class GroupMemberResponse(
    @field:Schema(
        description = "Legacy member username; planned to be replaced by a Loculus user ID before v1 stabilises.",
    )
    val username: String,
)

data class GroupSummaryResponse(val groupId: Int, val groupName: String)

data class GroupPageResponse(
    @field:Schema(description = "The caller's groups, ordered by ascending group ID. Empty when no memberships match.")
    val groups: List<GroupSummaryResponse>,
    @field:Schema(
        description = "Last returned group ID when another page exists. Pass as after for the next " +
            "request; null when there are no further results.",
        minimum = "1",
        nullable = true,
    )
    val nextAfter: Int?,
)
