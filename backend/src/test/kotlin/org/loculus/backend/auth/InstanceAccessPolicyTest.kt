package org.loculus.backend.auth

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority

class InstanceAccessPolicyTest {
    private val adapter = InstanceActorAdapter()
    private val policy = InstanceAccessPolicy(true)
    private fun actor(vararg roles: String) = adapter.resolve(
        UsernamePasswordAuthenticationToken("user", "", roles.map { SimpleGrantedAuthority(it) }),
    )

    @Test
    fun `anonymous users cannot read restricted data`() {
        assertFalse(policy.canReadReleasedData(adapter.resolve(null)))
    }

    @Test
    fun `viewers can read but cannot contribute or manage membership`() {
        assertTrue(policy.canReadReleasedData(actor()))
        assertFalse(policy.canContribute(actor()))
        assertFalse(policy.canManageMembership(actor()))
    }

    @Test
    fun `contributors do not automatically administer membership`() {
        assertTrue(policy.canContribute(actor("contributor")))
        assertFalse(policy.canManageMembership(actor("contributor")))
    }

    @Test
    fun `super users retain compatibility capabilities`() {
        assertTrue(policy.canContribute(actor(Roles.SUPER_USER)))
        assertTrue(policy.canManageMembership(actor(Roles.SUPER_USER)))
    }

    @Test
    fun `service roles do not grant human contribution`() {
        assertFalse(policy.canContribute(actor(Roles.PREPROCESSING_PIPELINE)))
        assertFalse(policy.canContribute(actor("get_released_data")))
    }

    @Test
    fun `public mode preserves anonymous reads and authenticated contributions`() {
        val publicPolicy = InstanceAccessPolicy(false)
        assertTrue(publicPolicy.canReadReleasedData(adapter.resolve(null)))
        assertTrue(publicPolicy.canContribute(actor()))
        assertFalse(publicPolicy.canContribute(adapter.resolve(null)))
    }
}
