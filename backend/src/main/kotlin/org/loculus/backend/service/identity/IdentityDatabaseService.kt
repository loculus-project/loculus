package org.loculus.backend.service.identity

import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.loculus.backend.auth.ExternalIdentity
import org.loculus.backend.auth.LoculusPrincipal
import org.loculus.backend.utils.DateProvider
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class IdentityDatabaseService(private val dateProvider: DateProvider) {
    // Separate transactions ensure a uniqueness conflict rolls back before the resolver reads the winner.
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    fun find(identity: ExternalIdentity): LoculusPrincipal? {
        val row = (ExternalIdentitiesTable innerJoin LoculusUsersTable).selectAll().where {
            (ExternalIdentitiesTable.issuer eq identity.issuer) and
                (ExternalIdentitiesTable.subject eq identity.subject)
        }.singleOrNull() ?: return null
        return LoculusPrincipal(row[LoculusUsersTable.id], row[LoculusUsersTable.provisionedAt], identity)
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = [Exception::class])
    fun create(identity: ExternalIdentity, username: String?): LoculusPrincipal {
        val userId = UUID.randomUUID()
        val now = dateProvider.getCurrentDateTime()
        LoculusUsersTable.insert {
            it[id] = userId
            it[provisionedAt] = now
        }
        ExternalIdentitiesTable.insert {
            it[issuer] = identity.issuer
            it[subject] = identity.subject
            it[ExternalIdentitiesTable.userId] = userId
            it[preferredUsername] = username
            it[linkedAt] = now
        }
        // Read back PostgreSQL's timestamp precision so first and subsequent responses agree.
        val provisionedAt = LoculusUsersTable.selectAll().where { LoculusUsersTable.id eq userId }
            .single()[LoculusUsersTable.provisionedAt]
        return LoculusPrincipal(userId, provisionedAt, identity)
    }

    @Transactional(readOnly = true)
    fun findUsername(principal: LoculusPrincipal): String? = ExternalIdentitiesTable.selectAll().where {
        (ExternalIdentitiesTable.issuer eq principal.externalIdentity.issuer) and
            (ExternalIdentitiesTable.subject eq principal.externalIdentity.subject) and
            (ExternalIdentitiesTable.userId eq principal.userId)
    }.singleOrNull()?.get(ExternalIdentitiesTable.preferredUsername)
}
