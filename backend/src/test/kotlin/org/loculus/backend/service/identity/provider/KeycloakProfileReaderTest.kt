package org.loculus.backend.service.identity.provider

import io.mockk.Called
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import jakarta.ws.rs.NotFoundException
import jakarta.ws.rs.ProcessingException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.auth.ExternalIdentity
import org.loculus.backend.service.KeycloakAdapter

class KeycloakProfileReaderTest {
    private val keycloak = mockk<KeycloakAdapter>()
    private val identity = ExternalIdentity("https://identity.example/realms/loculus", "subject")
    private val reader = KeycloakProfileReader(keycloak, identity.issuer)

    @Test
    fun `maps provider fields and preserves unknown verification`() {
        for (verified in listOf(true, false, null)) {
            every { keycloak.getUserById(identity.subject) } returns UserRepresentation().apply {
                id = identity.subject
                username = "Alice"
                firstName = "Alice"
                lastName = "Researcher"
                email = "alice@example.org"
                isEmailVerified = verified
                attributes = mapOf("university" to listOf("Institute"), "orcid.path" to listOf("0000-0001"))
            }
            assertEquals(
                ProviderProfileSeed(
                    "Alice",
                    "Alice",
                    "Researcher",
                    "Institute",
                    "0000-0001",
                    "alice@example.org",
                    verified,
                ),
                reader.readProfile(identity),
            )
        }
    }

    @Test
    fun `service account may have no optional profile fields`() {
        every { keycloak.getUserById(identity.subject) } returns UserRepresentation().apply {
            id = identity.subject
            username = "service-account-pipeline"
        }
        val seed = reader.readProfile(identity)
        assertEquals("service-account-pipeline", seed.username)
        assertNull(seed.email)
        assertNull(seed.givenName)
        assertNull(seed.affiliation)
    }

    @Test
    fun `unconfigured issuer never controls the provider request`() {
        assertThrows<IllegalArgumentException> {
            reader.readProfile(identity.copy(issuer = "https://attacker.example"))
        }
        verify { keycloak wasNot Called }
    }

    @Test
    fun `provider outage is distinguished from deleted or mismatched accounts`() {
        every { keycloak.getUserById(identity.subject) } throws ProcessingException("private provider hostname")
        assertThrows<IdentityProviderUnavailableException> { reader.readProfile(identity) }
        every { keycloak.getUserById(identity.subject) } throws NotFoundException()
        assertThrows<NotFoundException> { reader.readProfile(identity) }
        every { keycloak.getUserById(identity.subject) } returns UserRepresentation().apply { id = "other-subject" }
        assertThrows<IllegalStateException> { reader.readProfile(identity) }
    }
}
