package org.loculus.backend.service.identity

import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.loculus.backend.auth.ExternalIdentity
import org.loculus.backend.auth.LoculusPrincipal
import org.loculus.backend.service.identity.provider.ProviderProfileSeed
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
    fun create(identity: ExternalIdentity, seed: ProviderProfileSeed): LoculusPrincipal {
        val username = seed.username?.lowercase()?.takeIf { it.isNotBlank() && it == it.trim() }
        requireNotNull(username) { "A usable username is required for provisioning." }
        val userId = UUID.randomUUID()
        val now = dateProvider.getCurrentDateTime()
        LoculusUsersTable.insert {
            it[id] = userId
            it[provisionedAt] = now
            it[LoculusUsersTable.username] = username
            it[givenName] = seed.givenName
            it[familyName] = seed.familyName
            it[affiliation] = seed.affiliation
            it[orcidId] = seed.orcidId
        }
        ExternalIdentitiesTable.insert {
            it[issuer] = identity.issuer
            it[subject] = identity.subject
            it[ExternalIdentitiesTable.userId] = userId
            it[linkedAt] = now
        }
        seed.email?.takeUnless { it.isBlank() }?.let { email ->
            UserEmailTable.insert {
                it[UserEmailTable.userId] = userId
                it[address] = email
                it[verified] = seed.emailVerified
                it[sourceIssuer] = identity.issuer
                it[sourceSubject] = identity.subject
                it[importedAt] = now
            }
        }
        // Read back PostgreSQL's timestamp precision so first and subsequent responses agree.
        val provisionedAt = LoculusUsersTable.selectAll().where { LoculusUsersTable.id eq userId }
            .single()[LoculusUsersTable.provisionedAt]
        return LoculusPrincipal(userId, provisionedAt, identity)
    }
}
