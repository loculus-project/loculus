package org.loculus.backend.auth

import org.loculus.backend.config.BackendConfig
import org.loculus.backend.errors.ConflictException
import org.loculus.backend.errors.ServiceUnavailableException
import org.loculus.backend.errors.UnauthorizedException
import org.loculus.backend.service.identity.IDENTITY_UNIQUE_CONSTRAINT
import org.loculus.backend.service.identity.IdentityDatabaseService
import org.loculus.backend.service.identity.USERNAME_UNIQUE_CONSTRAINT
import org.loculus.backend.service.identity.provider.IdentityProviderProfileReader
import org.loculus.backend.service.identity.provider.IdentityProviderUnavailableException
import org.loculus.backend.service.identity.provider.ProviderProfileSeed
import org.postgresql.util.PSQLException
import org.springframework.dao.DataAccessResourceFailureException
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Service
import org.springframework.transaction.CannotCreateTransactionException
import java.sql.SQLException

@Service
class LoculusIdentityResolver(
    private val database: IdentityDatabaseService,
    private val config: BackendConfig,
    private val profiles: IdentityProviderProfileReader,
) {
    /** Call only with the JWT authenticated by Spring, never with independently decoded client input. */
    fun resolve(jwt: Jwt): LoculusPrincipal {
        val issuer = jwt.getClaimAsString("iss")?.takeUnless { it.isBlank() }
            ?: throw UnauthorizedException("Token is missing a usable issuer.")
        val subject = jwt.getClaimAsString("sub")?.takeUnless { it.isBlank() }
            ?: throw UnauthorizedException("Token is missing a usable subject.")
        val identity = ExternalIdentity(issuer, subject)
        try {
            database.find(identity)?.let { return it }
            if (config.readOnlyMode) {
                throw ServiceUnavailableException(
                    "Account provisioning is temporarily unavailable while this instance is in read-only mode.",
                )
            }
            // First-use seed only. Existing users never refresh from a token or provider here.
            // Network I/O finishes before create() starts its database transaction.
            val seed = try {
                profiles.readProfile(identity)
            } catch (_: IdentityProviderUnavailableException) {
                ProviderProfileSeed(jwt.getClaimAsString("preferred_username"))
            }.let { profile ->
                if (profile.username.isNullOrBlank()) {
                    profile.copy(username = jwt.getClaimAsString("preferred_username"))
                } else {
                    profile
                }
            }
            if (seed.username.isNullOrBlank() || seed.username != seed.username.trim()) {
                throw ServiceUnavailableException("A username is required to provision this account.")
            }
            try {
                return database.create(identity, seed)
            } catch (error: Exception) {
                // Recover only identity/username uniqueness races, not unrelated constraints or database errors.
                val constraint = generateSequence<Throwable>(error) { it.cause }
                    .filterIsInstance<PSQLException>().firstOrNull { it.sqlState == "23505" }
                    ?.serverErrorMessage?.constraint
                if (constraint != IDENTITY_UNIQUE_CONSTRAINT && constraint != USERNAME_UNIQUE_CONSTRAINT) throw error
                // Concurrent provisioning can hit username uniqueness before the identity PK.
                database.find(identity)?.let { return it }
                if (constraint == USERNAME_UNIQUE_CONSTRAINT) {
                    throw ConflictException("The username is already assigned to another Loculus account.")
                }
                throw error
            }
        } catch (error: Exception) {
            val unavailable = generateSequence<Throwable>(error) { it.cause }.any {
                it is DataAccessResourceFailureException || it is CannotCreateTransactionException ||
                    (
                        it is SQLException && (
                            it.sqlState?.startsWith("08") == true ||
                                it.sqlState in setOf("57P01", "57P02", "57P03", "53300")
                            )
                        )
            }
            if (unavailable) throw ServiceUnavailableException("Identity storage is temporarily unavailable.")
            throw error
        }
    }
}
