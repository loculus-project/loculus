package org.loculus.backend.service.identity

import org.loculus.backend.auth.ExternalIdentity
import org.loculus.backend.auth.LoculusPrincipal
import org.loculus.backend.errors.ServiceUnavailableException
import org.postgresql.util.PSQLException
import org.springframework.dao.DataAccessResourceFailureException
import org.springframework.stereotype.Service
import org.springframework.transaction.CannotCreateTransactionException
import java.sql.SQLException

/** Input must come from a validated token or the configured provider's administrative API. */
@Service
class IdentityProvisioningService(private val database: IdentityDatabaseService) {
    fun ensure(identity: ExternalIdentity, username: String?, allowCreate: Boolean = true): LoculusPrincipal {
        require(identity.issuer.isNotBlank() && identity.subject.isNotBlank())
        try {
            database.find(identity)?.let { return it }
            if (!allowCreate) {
                throw ServiceUnavailableException(
                    "Account provisioning is temporarily unavailable while this instance is in read-only mode.",
                )
            }
            try {
                return database.create(identity, username)
            } catch (error: Exception) {
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
