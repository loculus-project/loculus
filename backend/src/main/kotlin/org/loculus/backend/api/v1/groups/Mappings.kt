package org.loculus.backend.api.v1.groups

import org.loculus.backend.types.Address
import org.loculus.backend.types.Group
import org.loculus.backend.types.GroupDetails
import org.loculus.backend.types.NewGroup
import org.loculus.backend.types.User

fun GroupRequest.fromRequest() = NewGroup(
    groupName = groupName,
    institution = institution,
    address = address.fromRequest(),
    contactEmail = contactEmail,
)

fun Group.toResponse() = GroupResponse(
    groupId = groupId,
    groupName = groupName,
    institution = institution,
    address = address.toResponse(),
    contactEmail = contactEmail,
)

fun List<Group>.toResponse() = sortedBy { it.groupId }.map { it.toResponse() }

fun GroupDetails.toResponse() = group.toResponse()

fun GroupDetails.toMembersResponse() = users.orEmpty().map { it.toResponse() }

private fun User.toResponse() = GroupMemberResponse(username = name)

private fun GroupAddress.fromRequest() = Address(
    line1 = line1,
    line2 = line2,
    city = city,
    state = state,
    postalCode = postalCode,
    country = country,
)

private fun Address.toResponse() = GroupAddress(
    line1 = line1,
    line2 = line2,
    city = city,
    state = state,
    postalCode = postalCode,
    country = country,
)
