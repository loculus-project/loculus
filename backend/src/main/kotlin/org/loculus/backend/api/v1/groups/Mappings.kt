package org.loculus.backend.api.v1.groups

import org.loculus.backend.service.groupmanagement.GroupPage
import org.loculus.backend.types.Address
import org.loculus.backend.types.Group
import org.loculus.backend.types.GroupDetails
import org.loculus.backend.types.NewGroup

fun CreateGroupRequest.toServiceInput(): NewGroup = NewGroup(
    groupName,
    institution,
    Address(address.line1, address.line2, address.postalCode, address.city, address.state, address.country),
    contactEmail,
)

private fun Address.toResponse(): GroupAddressResponse =
    GroupAddressResponse(line1, line2, postalCode, city, state, country)

fun Group.toResponse(): GroupResponse =
    GroupResponse(groupId, groupName, institution, address.toResponse(), contactEmail)

fun GroupDetails.toResponse(): GroupDetailsResponse = GroupDetailsResponse(
    group.groupId,
    group.groupName,
    group.institution,
    group.address.toResponse(),
    group.contactEmail,
    users?.map { GroupMemberResponse(it.name) },
)

fun GroupPage.toResponse(): GroupPageResponse =
    GroupPageResponse(groups.map { GroupSummaryResponse(it.groupId, it.groupName) }, nextAfter)
