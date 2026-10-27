package org.loculus.backend.service.groupmanagement

import org.loculus.backend.auth.LoculusPrincipal
import org.loculus.backend.errors.BadRequestException
import org.loculus.backend.types.Group
import org.loculus.backend.types.GroupDetails
import org.loculus.backend.types.NewGroup
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

data class GroupPage(val groups: List<Group>, val nextAfter: Int?)

@Service
@Transactional
class GroupService(
    private val authorization: GroupAuthorizationService,
    private val database: GroupManagementDatabaseService,
) {
    @Transactional(readOnly = true)
    fun list(actor: LoculusPrincipal, limit: Int, after: Int): GroupPage {
        if (limit !in 1..100 ||
            after < 0
        ) {
            throw BadRequestException("limit must be 1–100 and after must be nonnegative.")
        }
        val username = authorization.membershipUsername(actor)
        val rows = database.getMembershipGroups(username, limit + 1, after)
        val page = rows.take(limit)
        return GroupPage(page, if (rows.size > limit) page.last().groupId else null)
    }

    @Transactional(readOnly = true)
    fun details(groupId: Int, authenticated: Boolean): GroupDetails {
        if (groupId <= 0) throw BadRequestException("groupId must be positive.")
        return database.getDetailsOfGroup(groupId, authorization.canViewPrivateDetails(authenticated))
    }

    // As with existing endpoints, any authenticated account may create a group, including service accounts.
    // Read-only mode is enforced centrally by ReadOnlyModeInterceptor.
    fun create(actor: LoculusPrincipal, group: NewGroup): Group =
        database.createNewGroup(group, authorization.membershipUsername(actor))
}
