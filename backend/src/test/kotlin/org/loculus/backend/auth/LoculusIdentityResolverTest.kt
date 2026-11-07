package org.loculus.backend.auth

import io.mockk.Called
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.datetime.LocalDateTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
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
import org.postgresql.util.ServerErrorMessage
import org.springframework.dao.DataAccessResourceFailureException
import org.springframework.security.oauth2.jwt.Jwt
import java.util.UUID

class LoculusIdentityResolverTest {
    private val database = mockk<IdentityDatabaseService>()
    private val config = mockk<BackendConfig>()
    private val seed = ProviderProfileSeed("testuser")
    private val profiles = mockk<IdentityProviderProfileReader> { every { readProfile(any()) } returns seed }
    private val resolver = LoculusIdentityResolver(database, config, profiles)
    private val identity = ExternalIdentity("https://identity.example/realms/loculus", "subject-1")
    private val principal = LoculusPrincipal(UUID.randomUUID(), LocalDateTime(2026, 10, 27, 0, 0), identity)

    @Test
    fun `existing identity resolves even in read-only mode without refreshing profile data`() {
        every { database.find(identity) } returns principal
        every { config.readOnlyMode } returns true
        assertEquals(principal, resolver.resolve(jwt("subject-1")))
        verify(exactly = 0) { database.create(any(), any()) }
        verify { profiles wasNot Called }
    }

    @Test
    fun `new identity is provisioned with initial username`() {
        every { database.find(identity) } returns null
        every { config.readOnlyMode } returns false
        every { database.create(identity, seed) } returns principal
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
    fun `missing and blank issuers fail before database access`() {
        for (issuer in listOf(null, "", "   ")) {
            val error = assertThrows<UnauthorizedException> { resolver.resolve(jwt("subject-1", issuer)) }
            assertEquals("Token is missing a usable issuer.", error.message)
        }
        verify { database wasNot Called }
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
    fun `provider outage falls back to token username without profile claims`() {
        every { database.find(identity) } returns null
        every { config.readOnlyMode } returns false
        every { profiles.readProfile(identity) } throws IdentityProviderUnavailableException(RuntimeException())
        every { database.create(identity, seed) } returns principal
        assertEquals(principal, resolver.resolve(jwt("subject-1")))
        verify(exactly = 1) { database.create(identity, seed) }
    }

    @Test
    fun `provider outage without token username does not create a partial user`() {
        every { database.find(identity) } returns null
        every { config.readOnlyMode } returns false
        every { profiles.readProfile(identity) } throws IdentityProviderUnavailableException(RuntimeException())
        val token = Jwt.withTokenValue("test").header("alg", "RS256")
            .issuer(identity.issuer).subject(identity.subject).build()
        assertThrows<ServiceUnavailableException> { resolver.resolve(token) }
        verify(exactly = 0) { database.create(any(), any()) }
    }

    @Test
    fun `missing provider username refuses partial provisioning`() {
        every { database.find(identity) } returns null
        every { config.readOnlyMode } returns false
        every { profiles.readProfile(identity) } returns ProviderProfileSeed(null)
        val token = Jwt.withTokenValue("test").header("alg", "RS256")
            .issuer(identity.issuer).subject(identity.subject).build()
        assertThrows<ServiceUnavailableException> { resolver.resolve(token) }
        verify(exactly = 0) { database.create(any(), any()) }
    }

    @Test
    fun `provider without username can use token username while preserving the profile seed`() {
        every { database.find(identity) } returns null
        every { config.readOnlyMode } returns false
        every { profiles.readProfile(identity) } returns ProviderProfileSeed(null, givenName = "Initial")
        val expected = ProviderProfileSeed("testuser", givenName = "Initial")
        every { database.create(identity, expected) } returns principal
        assertEquals(principal, resolver.resolve(jwt("subject-1")))
        verify(exactly = 1) { database.create(identity, expected) }
    }

    @Test
    fun `username collision does not link another external identity`() {
        every { database.find(identity) } returns null
        every { config.readOnlyMode } returns false
        every { database.create(identity, any()) } throws uniqueViolation(USERNAME_UNIQUE_CONSTRAINT)
        assertThrows<ConflictException> { resolver.resolve(jwt("subject-1")) }
    }

    @Test
    fun `a concurrent username insert resolves only the same identity`() {
        every { database.find(identity) } returnsMany listOf(null, principal)
        every { config.readOnlyMode } returns false
        every { database.create(identity, any()) } throws uniqueViolation(USERNAME_UNIQUE_CONSTRAINT)
        assertEquals(principal, resolver.resolve(jwt("subject-1")))
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

    private fun jwt(subject: String?, issuer: String? = identity.issuer): Jwt = Jwt.withTokenValue("not-a-real-token")
        .header("alg", "RS256")
        .claim("preferred_username", "testuser")
        .apply { if (issuer != null) claim("iss", issuer) }
        .apply { if (subject != null) claim("sub", subject) }
        .build()
}
