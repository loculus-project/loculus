package org.loculus.backend.service.groupmanagement

import io.mockk.every
import io.mockk.mockk
import kotlinx.datetime.LocalDateTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.auth.ExternalIdentity
import org.loculus.backend.auth.LoculusPrincipal
import org.loculus.backend.errors.ForbiddenException
import org.loculus.backend.service.identity.IdentityDatabaseService
import java.util.UUID

class GroupAuthorizationServiceTest {
    private val identities = mockk<IdentityDatabaseService>()
    private val service = GroupAuthorizationService(identities)
    private val actor = LoculusPrincipal(
        UUID.randomUUID(),
        LocalDateTime(2026, 10, 27, 0, 0),
        ExternalIdentity("issuer", "subject"),
    )

    @Test
    fun `membership uses the stored username for the request identity`() {
        every { identities.findUsername(actor) } returns "stored-username"
        assertEquals("stored-username", service.membershipUsername(actor))
    }

    @Test
    fun `missing and blank usernames cannot authorize membership operations`() {
        for (username in listOf(null, "", "  ")) {
            every { identities.findUsername(actor) } returns username
            assertThrows<ForbiddenException> { service.membershipUsername(actor) }
        }
    }

    @Test
    fun `private group details require authentication not membership or a privileged role`() {
        assertFalse(service.canViewPrivateDetails(false))
        assertTrue(service.canViewPrivateDetails(true))
    }
}
