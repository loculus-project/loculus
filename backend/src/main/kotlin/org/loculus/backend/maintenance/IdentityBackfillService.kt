package org.loculus.backend.maintenance

import org.loculus.backend.auth.ExternalIdentity
import org.loculus.backend.auth.LoculusPrincipal
import org.loculus.backend.service.KeycloakAdapter
import org.loculus.backend.service.groupmanagement.MembershipDatabaseService
import org.loculus.backend.service.identity.IdentityDatabaseService
import org.loculus.backend.service.identity.IdentityProvisioningService
import org.postgresql.util.PSQLException

/** Explicitly constructed by the maintenance command, never registered in the web application. */
class IdentityBackfillService(
    private val keycloak: KeycloakAdapter,
    private val identities: IdentityDatabaseService,
    private val provisioning: IdentityProvisioningService,
    private val memberships: MembershipDatabaseService,
) {
    fun run(apply: Boolean, report: IdentityBackfillReport) {
        require(report.issuer.isNotBlank())
        // Check schema/access and finish provider enumeration before the first write. Offset pagination
        // is not a realm snapshot; operators must rerun after concurrent account creation/deletion.
        val rows = memberships.read()
        val accounts = linkedMapOf<String, org.keycloak.representations.idm.UserRepresentation>()
        var offset = 0
        while (true) {
            val page = keycloak.getUsersPage(offset, 200)
            if (page.isEmpty()) break
            page.forEach { user ->
                report.accountsScanned++
                val id = user.id?.takeIf { it.isNotBlank() }
                if (id == null) {
                    report.issues.add(BackfillIssue("provider_account_missing_id", username = user.username))
                } else {
                    check(accounts.putIfAbsent(id, user) == null) { "Provider pagination changed; rerun the scan." }
                }
            }
            offset += page.size
        }
        val byName = accounts.values.filter { !it.username.isNullOrBlank() }.groupBy { it.username.lowercase() }
        val principals = mutableMapOf<String, LoculusPrincipal?>()
        accounts.forEach { (id, user) ->
            val identity = ExternalIdentity(report.issuer, id)
            val existing = identities.find(identity)
            if (existing == null) report.identitiesNeedingProvisioning++ else report.identitiesAlreadyPresent++
            principals[id] = if (apply) {
                provisioning.ensure(identity, user.username).also { report.identitiesEnsured++ }
            } else {
                existing
            }
        }
        val targets = rows.associate { row -> row.id to byName[row.username.lowercase()]?.singleOrNull()?.id }
        // Detect all members of a collision, rather than arbitrarily linking the first row.
        val collisions = rows.filter { targets[it.id] != null }.groupBy {
            it.groupId to (principals[targets[it.id]]?.userId?.toString() ?: "subject:${targets[it.id]}")
        }.values.filter { it.size > 1 }.flatten().map { it.id }.toSet()
        for (row in rows) {
            val matches = byName[row.username.lowercase()].orEmpty()
            val subject = targets[row.id]
            fun issue(reason: String) {
                report.issues.add(BackfillIssue(reason, row.id, row.groupId, row.username, subject))
            }
            when {
                matches.isEmpty() -> issue("no_provider_match")

                matches.size != 1 -> issue("ambiguous_username")

                row.id in collisions -> issue("duplicate_identity_in_group")

                row.userId != null -> {
                    if (row.userId == principals[subject]?.userId) {
                        report.membershipsAlreadyLinked++
                    } else {
                        issue("identity_conflict")
                    }
                }

                else -> {
                    val targetId = principals[subject]?.userId
                    // Also catch a pre-existing link whose legacy username no longer resolves.
                    if (targetId != null && rows.any {
                            it.id != row.id && it.groupId == row.groupId && it.userId == targetId
                        }
                    ) {
                        issue("duplicate_identity_in_group")
                        continue
                    }
                    report.membershipsToLink++
                    if (!apply) continue
                    try {
                        when (val outcome = memberships.link(row, requireNotNull(targetId))) {
                            "linked" -> report.membershipsLinked++
                            "already_linked" -> report.membershipsAlreadyLinked++
                            else -> issue(outcome)
                        }
                    } catch (error: Exception) {
                        val duplicate = generateSequence<Throwable>(error) { it.cause }.any {
                            it is PSQLException && it.sqlState == "23505" &&
                                it.serverErrorMessage?.constraint == "user_groups_user_id_group_id_key"
                        }
                        if (!duplicate) throw error
                        issue("duplicate_identity_in_group")
                    }
                }
            }
        }
        report.result = if (report.issues.isEmpty()) "COMPLETE" else "INCOMPLETE"
    }
}
