package org.loculus.backend.auth

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.datetime.LocalDateTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.errors.ServiceUnavailableException
import org.loculus.backend.errors.UnauthorizedException
import org.loculus.backend.service.identity.IDENTITY_UNIQUE_CONSTRAINT
import org.loculus.backend.service.identity.IdentityDatabaseService
import org.postgresql.util.PSQLException
import org.postgresql.util.ServerErrorMessage
import org.springframework.dao.DataAccessResourceFailureException
import org.springframework.security.oauth2.jwt.Jwt
import java.util.UUID

class LoculusIdentityResolverTest {
    private val database = mockk<IdentityDatabaseService>()
    private val config = mockk<BackendConfig>()
    private val resolver = LoculusIdentityResolver(database, config)
    private val identity = ExternalIdentity("https://identity.example/realms/loculus", "subject-1")
    private val principal = LoculusPrincipal(UUID.randomUUID(), LocalDateTime(2026, 10, 27, 0, 0), identity)

    @Test
    fun `existing identity resolves even in read-only mode without refreshing profile data`() {
        every { database.find(identity) } returns principal
        every { config.readOnlyMode } returns true
        assertEquals(principal, resolver.resolve(jwt("subject-1")))
        verify(exactly = 0) { database.create(any(), any()) }
    }

    @Test
    fun `new identity is provisioned with initial username`() {
        every { database.find(identity) } returns null
        every { config.readOnlyMode } returns false
        every { database.create(identity, "testuser") } returns principal
        assertEquals(principal, resolver.resolve(jwt("subject-1")))
    }

    @Test
    fun `new identity cannot be provisioned in read-only mode`() {
        every { database.find(identity) } returns null
        every { config.readOnlyMode } returns true
        assertThrows<ServiceUnavailableException> { resolver.resolve(jwt("subject-1")) }
        verify(exactly = 0) { database.create(any(), any()) }
    }

    @Test
    fun `missing and blank subjects fail before database access`() {
        for (subject in listOf(null, "", "   ")) {
            assertThrows<UnauthorizedException> { resolver.resolve(jwt(subject)) }
        }
        verify(exactly = 0) { database.find(any()) }
    }

    @Test
    fun `storage outage is unavailable without exposing database details`() {
        every { database.find(identity) } throws DataAccessResourceFailureException("private database hostname")
        val error = assertThrows<ServiceUnavailableException> { resolver.resolve(jwt("subject-1")) }
        assertEquals("Identity storage is temporarily unavailable.", error.message)
    }

    @Test
    fun `unrelated errors are not disguised as availability failures`() {
        every { database.find(identity) } throws IllegalStateException("programming error")
        assertThrows<IllegalStateException> { resolver.resolve(jwt("subject-1")) }
    }

    @Test
    fun `a concurrent identity insert reads the winner after rollback`() {
        every { database.find(identity) } returnsMany listOf(null, principal)
        every { config.readOnlyMode } returns false
        every { database.create(identity, any()) } throws uniqueViolation(IDENTITY_UNIQUE_CONSTRAINT)
        assertEquals(principal, resolver.resolve(jwt("subject-1")))
        verify(exactly = 2) { database.find(identity) }
        verify(exactly = 1) { database.create(identity, any()) }
    }

    @Test
    fun `other unique violations are not treated as concurrent provisioning`() {
        every { database.find(identity) } returns null
        every { config.readOnlyMode } returns false
        every { database.create(identity, any()) } throws uniqueViolation("unrelated_constraint")
        assertThrows<PSQLException> { resolver.resolve(jwt("subject-1")) }
        verify(exactly = 1) { database.find(identity) }
    }

    private fun uniqueViolation(constraint: String) = PSQLException(
        ServerErrorMessage("SERROR\u0000C23505\u0000Mduplicate key\u0000n$constraint\u0000\u0000"),
    )

    private fun jwt(subject: String?): Jwt = Jwt.withTokenValue("not-a-real-token")
        .header("alg", "RS256")
        .issuer(identity.issuer)
        .claim("preferred_username", "testuser")
        .apply { if (subject != null) claim("sub", subject) }
        .build()
}
