package org.loculus.backend.service.identity

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.auth.ExternalIdentity
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.errors.ServiceUnavailableException

class LegacyMemberIdentityResolverTest {
    private val provisioning = mockk<IdentityProvisioningService>(relaxed = true)
    private val config = mockk<BackendConfig> { every { readOnlyMode } returns false }
    private val resolver = LegacyMemberIdentityResolver(provisioning, config, "https://public.example/realms/loculus")

    @Test
    fun `provider account id and configured issuer identify target not caller or internal URL`() {
        resolver.resolve(
            UserRepresentation().apply {
                id = "target-subject"
                username = "target"
            },
        )
        verify {
            provisioning.ensure(
                ExternalIdentity("https://public.example/realms/loculus", "target-subject"),
                "target",
                true,
            )
        }
    }

    @Test
    fun `malformed provider response fails without a provisional identity`() {
        assertThrows<ServiceUnavailableException> { resolver.resolve(UserRepresentation()) }
        verify(exactly = 0) { provisioning.ensure(any(), any(), any()) }
    }
}
