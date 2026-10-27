package org.loculus.backend.service.groupmanagement

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.auth.ExternalIdentity
import org.loculus.backend.errors.ForbiddenException
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.service.identity.IdentityDatabaseService
import org.loculus.backend.testutil.DEFAULT_GROUP
import org.loculus.backend.testutil.EndpointTest
import org.loculus.backend.testutil.TEST_TOKEN_ISSUER
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class GroupServiceTest(
    @Autowired private val groups: GroupService,
    @Autowired private val identities: IdentityDatabaseService,
) {
    @MockkBean
    lateinit var audit: AuditLogger

    @Test
    fun `creation rolls back group and membership when a later operation fails`() {
        val actor = identities.create(ExternalIdentity(TEST_TOKEN_ISSUER, "creator"), "creator")
        every { audit.log(any<String>(), any<String>()) } throws IllegalStateException("audit failed")
        assertThrows<IllegalStateException> { groups.create(actor, DEFAULT_GROUP) }
        transaction {
            assertEquals(0L, GroupsTable.selectAll().count())
            assertEquals(0L, UserGroupsTable.selectAll().count())
        }
    }

    @Test
    fun `missing legacy username does not create a partial group`() {
        val actor = identities.create(ExternalIdentity(TEST_TOKEN_ISSUER, "unnamed"), null)
        assertThrows<ForbiddenException> { groups.create(actor, DEFAULT_GROUP) }
        transaction {
            assertEquals(0L, GroupsTable.selectAll().count())
            assertEquals(0L, UserGroupsTable.selectAll().count())
        }
    }
}
