package org.loculus.backend.maintenance

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.exceptions.ExposedSQLException
import org.jetbrains.exposed.v1.jdbc.deleteAll
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.api.v0.groups.GroupManagementControllerClient
import org.loculus.backend.api.v0.groups.andGetGroupId
import org.loculus.backend.auth.ExternalIdentity
import org.loculus.backend.auth.LoculusIdentityResolver
import org.loculus.backend.service.KeycloakAdapter
import org.loculus.backend.service.groupmanagement.GroupsTable
import org.loculus.backend.service.groupmanagement.MembershipDatabaseService
import org.loculus.backend.service.groupmanagement.UserGroupsTable
import org.loculus.backend.service.identity.ExternalIdentitiesTable
import org.loculus.backend.service.identity.IdentityDatabaseService
import org.loculus.backend.service.identity.IdentityProvisioningService
import org.loculus.backend.service.identity.LoculusUsersTable
import org.loculus.backend.testutil.DEFAULT_GROUP_CHANGED
import org.loculus.backend.testutil.DEFAULT_USER_NAME
import org.loculus.backend.testutil.EndpointTest
import org.loculus.backend.testutil.TEST_TOKEN_ISSUER
import org.loculus.backend.testutil.generateJwtFor
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.util.UUID

@EndpointTest
class IdentityBackfillTest(
    @Autowired private val database: IdentityDatabaseService,
    @Autowired private val provisioning: IdentityProvisioningService,
    @Autowired private val memberships: MembershipDatabaseService,
    @Autowired private val client: GroupManagementControllerClient,
    @Autowired private val jit: LoculusIdentityResolver,
) {
    @MockkBean
    lateinit var keycloak: KeycloakAdapter

    private fun account(name: String, subject: String = UUID.nameUUIDFromBytes(name.toByteArray()).toString()) =
        UserRepresentation().apply {
            id = subject
            username = name
        }

    private fun provider(vararg users: UserRepresentation) {
        every { keycloak.getUsersPage(0, 200) } returns users.toList()
        every { keycloak.getUsersPage(users.size, 200) } returns emptyList()
    }

    private fun run(apply: Boolean = false): IdentityBackfillReport {
        val report = IdentityBackfillReport(if (apply) "APPLY" else "DRY_RUN", TEST_TOKEN_ISSUER)
        IdentityBackfillService(keycloak, database, provisioning, memberships).run(apply, report)
        return report
    }

    private fun legacyGroup(): Int {
        val id = client.createNewGroup().andExpect(status().isOk).andGetGroupId()
        transaction {
            UserGroupsTable.update({ UserGroupsTable.groupIdColumn eq id }) { it[userIdColumn] = null }
            ExternalIdentitiesTable.deleteAll()
            LoculusUsersTable.deleteAll()
        }
        return id
    }

    @Test
    fun `deployed but not backfilled v0 reads permissions and new memberships still work`() {
        val groupId = legacyGroup()
        val target = account("new-member")
        every { keycloak.getUsersWithName(DEFAULT_USER_NAME) } returns listOf(account(DEFAULT_USER_NAME))
        every { keycloak.getUsersWithName("new-member") } returns listOf(target)
        client.getGroupsOfUser().andExpect(status().isOk)
            .andExpect(jsonPath("\$[0].groupId").value(groupId))
            .andExpect(jsonPath("\$.length()").value(1))
        client.getDetailsOfGroup(groupId, jwt = null).andExpect(status().isOk)
            .andExpect(jsonPath("\$.group.groupId").value(groupId))

        // A valid token alone does not grant membership or permission to modify this legacy group.
        val outsiderJwt = generateJwtFor("outsider")
        every { keycloak.getUsersWithName("outsider") } returns listOf(account("outsider"))
        val beforeDeniedRequests = memberships.read()
        client.getGroupsOfUser(jwt = outsiderJwt).andExpect(status().isOk)
            .andExpect(jsonPath("\$.length()").value(0))
        client.updateGroup(groupId, DEFAULT_GROUP_CHANGED, jwt = outsiderJwt).andExpect(status().isForbidden)
        client.addUserToGroup(groupId, "new-member", jwt = outsiderJwt).andExpect(status().isForbidden)
        client.removeUserFromGroup(groupId, DEFAULT_USER_NAME, jwt = outsiderJwt).andExpect(status().isForbidden)
        assertEquals(beforeDeniedRequests, memberships.read())
        assertNull(database.find(ExternalIdentity(TEST_TOKEN_ISSUER, target.id)))

        client.updateGroup(groupId, DEFAULT_GROUP_CHANGED).andExpect(status().isOk)
        client.addUserToGroup(groupId, "new-member").andExpect(status().isNoContent)
        val rows = memberships.read()
        assertNull(rows.single { it.username == DEFAULT_USER_NAME }.userId)
        assertEquals(
            database.find(ExternalIdentity(TEST_TOKEN_ISSUER, target.id))!!.userId,
            rows.single { it.username == "new-member" }.userId,
        )
        // This member has never logged in; the later JIT request must reuse the ID.
        val jwt = Jwt.withTokenValue("test").header("alg", "RS256").issuer(TEST_TOKEN_ISSUER)
            .subject(target.id).claim("preferred_username", target.username).build()
        assertEquals(rows.single { it.username == "new-member" }.userId, jit.resolve(jwt).userId)

        // Removing a dual-written membership removes the whole row, not the provisioned identity.
        val targetId = rows.single { it.username == "new-member" }.userId
        client.removeUserFromGroup(groupId, "new-member").andExpect(status().isNoContent)
        assertEquals(listOf(DEFAULT_USER_NAME), memberships.read().map { it.username })
        assertEquals(targetId, database.find(ExternalIdentity(TEST_TOKEN_ISSUER, target.id))!!.userId)
        client.updateGroup(groupId, jwt = generateJwtFor("new-member")).andExpect(status().isForbidden)

        // The original, still-unbackfilled member can remove their own legacy membership too.
        assertNull(memberships.read().single().userId)
        client.removeUserFromGroup(groupId, DEFAULT_USER_NAME).andExpect(status().isNoContent)
        assertTrue(memberships.read().isEmpty())
        client.getGroupsOfUser().andExpect(status().isOk).andExpect(jsonPath("\$.length()").value(0))
        client.updateGroup(groupId).andExpect(status().isForbidden)
    }

    @Test
    fun `dry run writes nothing and apply is repeatable including disabled technical accounts`() {
        legacyGroup()
        provider(account(DEFAULT_USER_NAME), account("pipeline").apply { isEnabled = false })
        val dry = run()
        assertEquals(2, dry.identitiesNeedingProvisioning)
        assertEquals(1, dry.membershipsToLink)
        assertEquals(0, dry.exitCode())
        transaction { assertEquals(0, LoculusUsersTable.selectAll().count().toInt()) }
        assertNull(memberships.read().single().userId)
        val applied = run(true)
        assertEquals(2, applied.identitiesEnsured)
        assertEquals(1, applied.membershipsLinked)
        val linked = memberships.read().single().userId
        val repeated = run(true)
        assertEquals(2, repeated.identitiesAlreadyPresent)
        assertEquals(0, repeated.identitiesEnsured)
        assertEquals(0, repeated.identitiesNeedingProvisioning)
        assertEquals(0, repeated.membershipsLinked)
        assertEquals(1, repeated.membershipsAlreadyLinked)
        assertEquals(linked, memberships.read().single().userId)
        transaction { assertEquals(2, LoculusUsersTable.selectAll().count().toInt()) }
    }

    @Test
    fun `wrong issuer stops dry run and apply before enumeration or writes`() {
        legacyGroup()
        val original = provisioning.ensure(ExternalIdentity(TEST_TOKEN_ISSUER, "existing"), "existing")
        val before = memberships.read()
        for (apply in listOf(false, true)) {
            val report = IdentityBackfillReport(if (apply) "APPLY" else "DRY_RUN", "$TEST_TOKEN_ISSUER/")
            IdentityBackfillService(keycloak, database, provisioning, memberships).run(apply, report)
            assertEquals(1, report.exitCode())
            assertEquals("issuer_mismatch", report.issues.single().reason)
            assertEquals(0, report.accountsScanned)
            assertEquals(before, memberships.read())
            transaction { assertEquals(1L, LoculusUsersTable.selectAll().count()) }
        }
        assertEquals(original, database.find(original.externalIdentity))
        verify(exactly = 0) { keycloak.getUsersPage(any(), any()) }
    }

    @Test
    fun `existing link blocks a duplicate even when its old username no longer matches`() {
        val groupId = legacyGroup()
        val principal = provisioning.ensure(ExternalIdentity(TEST_TOKEN_ISSUER, "subject"), DEFAULT_USER_NAME)
        transaction {
            UserGroupsTable.insert {
                it[userNameColumn] = "old-name"
                it[groupIdColumn] = groupId
                it[userIdColumn] = principal.userId
            }
        }
        provider(account(DEFAULT_USER_NAME, "subject"))
        for (apply in listOf(false, true)) {
            val report = run(apply)
            assertEquals(
                setOf("no_provider_match", "duplicate_identity_in_group"),
                report.issues.map { it.reason }.toSet(),
            )
            assertEquals(0, report.membershipsLinked)
            assertNull(memberships.read().single { it.username == DEFAULT_USER_NAME }.userId)
        }
    }

    @Test
    fun `conflicts remain untouched while independent records progress`() {
        val groupId = legacyGroup()
        transaction {
            UserGroupsTable.insert {
                it[userNameColumn] = "missing"
                it[groupIdColumn] = groupId
            }
            UserGroupsTable.insert {
                it[userNameColumn] = "duplicate"
                it[groupIdColumn] = groupId
            }
        }
        provider(account(DEFAULT_USER_NAME), account("duplicate", "a"), account("DUPLICATE", "b"))
        val result = run(true)
        assertEquals(2, result.exitCode())
        assertEquals(setOf("no_provider_match", "ambiguous_username"), result.issues.map { it.reason }.toSet())
        assertEquals(1, result.membershipsLinked)
        assertEquals(2, memberships.read().count { it.userId == null })
    }

    @Test
    fun `case variants resolving to same member are both reported rather than merged`() {
        val groupId = legacyGroup()
        transaction {
            UserGroupsTable.insert {
                it[userNameColumn] = DEFAULT_USER_NAME.uppercase()
                it[groupIdColumn] = groupId
            }
        }
        provider(account(DEFAULT_USER_NAME))
        assertEquals(2, run().issues.count { it.reason == "duplicate_identity_in_group" })
        assertEquals(0, run(true).membershipsLinked)
        assertTrue(memberships.read().all { it.userId == null })
    }

    @Test
    fun `existing conflicting link is preserved`() {
        client.createNewGroup().andExpect(status().isOk)
        val original = memberships.read().single().userId
        provider(account(DEFAULT_USER_NAME, "different-subject"))
        assertEquals("identity_conflict", run(true).issues.single().reason)
        assertEquals(original, memberships.read().single().userId)
    }

    @Test
    fun `conditional writes preserve concurrent links and do not resurrect deletions`() {
        legacyGroup()
        val row = memberships.read().single()
        val a = provisioning.ensure(ExternalIdentity(TEST_TOKEN_ISSUER, "a"), "a")
        val b = provisioning.ensure(ExternalIdentity(TEST_TOKEN_ISSUER, "b"), "b")
        assertEquals("linked", memberships.link(row, a.userId))
        assertEquals("identity_conflict", memberships.link(row, b.userId))
        assertEquals(a.userId, memberships.read().single().userId)
        transaction { UserGroupsTable.deleteWhere { UserGroupsTable.id eq row.id } }
        assertEquals("removed_during_run", memberships.link(row, a.userId))
        assertTrue(memberships.read().isEmpty())
    }

    @Test
    fun `database prevents dangling links duplicate membership and cascading deletion`() {
        val groupId = client.createNewGroup().andExpect(status().isOk).andGetGroupId()
        val userId = memberships.read().single().userId!!
        assertThrows<ExposedSQLException> {
            transaction {
                UserGroupsTable.insert {
                    it[userNameColumn] = "alias"
                    it[groupIdColumn] = groupId
                    it[userIdColumn] = userId
                }
            }
        }
        assertThrows<ExposedSQLException> {
            transaction {
                UserGroupsTable.insert {
                    it[userNameColumn] = "missing"
                    it[groupIdColumn] = groupId
                    it[userIdColumn] = UUID.randomUUID()
                }
            }
        }
        // Remove the external link first so this tests the membership FK, not the external-identity FK.
        transaction { ExternalIdentitiesTable.deleteAll() }
        assertThrows<ExposedSQLException> { transaction { LoculusUsersTable.deleteAll() } }
        assertEquals(userId, memberships.read().single().userId)
    }

    @Test
    fun `provider enumeration failure stops before any writes`() {
        legacyGroup()
        every { keycloak.getUsersPage(0, 200) } returns listOf(account(DEFAULT_USER_NAME))
        every { keycloak.getUsersPage(1, 200) } throws IllegalStateException("provider unavailable")
        assertThrows<IllegalStateException> { run(true) }
        assertNull(memberships.read().single().userId)
        transaction { assertEquals(0, LoculusUsersTable.selectAll().count().toInt()) }
        verify(exactly = 1) { keycloak.getUsersPage(1, 200) }
    }

    @Test
    fun `membership failure rolls back group creation but can retain provisioned identity`() {
        transaction {
            exec(
                """create function fail_test_membership() returns trigger language plpgsql as
                'begin raise exception ''test membership failure''; end;'""",
            )
            exec(
                "create trigger fail_test_membership before insert on user_groups_table " +
                    "for each row execute function fail_test_membership()",
            )
        }
        try {
            client.createNewGroup().andExpect(status().isInternalServerError)
            transaction {
                assertEquals(0L, GroupsTable.selectAll().count())
                assertEquals(0L, UserGroupsTable.selectAll().count())
                assertEquals(1L, LoculusUsersTable.selectAll().count())
            }
        } finally {
            transaction {
                exec("drop trigger fail_test_membership on user_groups_table")
                exec("drop function fail_test_membership()")
            }
        }
    }

    @Test
    fun `fatal failure preserves previously committed links for a rerun`() {
        val groupId = legacyGroup()
        transaction {
            UserGroupsTable.insert {
                it[userNameColumn] = "second"
                it[groupIdColumn] = groupId
            }
        }
        provider(account(DEFAULT_USER_NAME), account("second"))
        val rows = memberships.read()
        val failingStore = mockk<org.loculus.backend.service.groupmanagement.MembershipDatabaseService>()
        every { failingStore.read() } returns rows
        every { failingStore.link(rows[0], any()) } answers { memberships.link(firstArg(), secondArg()) }
        every { failingStore.link(rows[1], any()) } throws java.sql.SQLException("unavailable", "08006")
        val report = IdentityBackfillReport("APPLY", TEST_TOKEN_ISSUER)
        assertThrows<java.sql.SQLException> {
            IdentityBackfillService(keycloak, database, provisioning, failingStore).run(true, report)
        }
        assertEquals(1, report.membershipsLinked)
        assertEquals(1, memberships.read().count { it.userId != null })
        assertEquals(1, run(true).membershipsLinked)
        assertTrue(memberships.read().all { it.userId != null })
    }
}
