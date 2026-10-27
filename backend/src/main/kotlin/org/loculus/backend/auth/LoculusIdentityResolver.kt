package org.loculus.backend.auth

import org.loculus.backend.config.BackendConfig
import org.loculus.backend.errors.ServiceUnavailableException
import org.loculus.backend.errors.UnauthorizedException
import org.loculus.backend.service.identity.IDENTITY_UNIQUE_CONSTRAINT
import org.loculus.backend.service.identity.IdentityDatabaseService
import org.postgresql.util.PSQLException
import org.springframework.dao.DataAccessResourceFailureException
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Service
import org.springframework.transaction.CannotCreateTransactionException
import java.sql.SQLException

@Service
class LoculusIdentityResolver(private val database: IdentityDatabaseService, private val config: BackendConfig) {
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
            try {
                return database.create(identity, jwt.getClaimAsString("preferred_username"))
            } catch (error: Exception) {
                // Recover only our exact identity-key conflict, not other unique constraints or database errors.
                val raced = generateSequence<Throwable>(error) { it.cause }.any {
                    it is PSQLException && it.sqlState == "23505" &&
                        it.serverErrorMessage?.constraint == IDENTITY_UNIQUE_CONSTRAINT
                }
                if (!raced) throw error
                return database.find(identity) ?: throw error
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
