package org.loculus.backend.service.identity

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.exceptions.ExposedSQLException
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.auth.ExternalIdentity
import org.loculus.backend.auth.LoculusIdentityResolver
import org.loculus.backend.service.identity.provider.IdentityProviderProfileReader
import org.loculus.backend.service.identity.provider.ProviderProfileSeed
import org.loculus.backend.testutil.EndpointTest
import org.loculus.backend.testutil.TEST_TOKEN_ISSUER
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.security.oauth2.jwt.Jwt
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@EndpointTest
class IdentityDatabaseServiceTest(
    @Autowired private val database: IdentityDatabaseService,
    @Autowired private val resolver: LoculusIdentityResolver,
) {
    @MockkBean
    lateinit var profiles: IdentityProviderProfileReader

    @BeforeEach
    fun profileSeed() {
        every { profiles.readProfile(any()) } returns ProviderProfileSeed("testuser")
    }

    @Test
    fun `identity lookup uses issuer and subject independently of username`() {
        val identity = ExternalIdentity(TEST_TOKEN_ISSUER, "one")
        val first = database.create(identity, ProviderProfileSeed("first"))
        assertEquals(first, database.find(identity))
        val second = database.create(identity.copy(subject = "two"), ProviderProfileSeed("second"))
        val third = database.create(identity.copy(issuer = "https://other.example"), ProviderProfileSeed("third"))
        assertEquals(3, setOf(first.userId, second.userId, third.userId).size)
        assertNotEquals(first.userId.toString(), identity.subject)
        assertNull(database.find(identity.copy(subject = "unknown")))
    }

    @Test
    fun `duplicate mapping rolls back the provisional user and preserves original snapshot`() {
        val identity = ExternalIdentity(TEST_TOKEN_ISSUER, "one")
        val first = database.create(identity, ProviderProfileSeed("original", email = "original@example.org"))
        assertThrows<ExposedSQLException> {
            database.create(identity, ProviderProfileSeed("changed", email = "changed@example.org"))
        }
        assertEquals(first, database.find(identity))
        transaction {
            assertEquals(
                "original",
                LoculusUsersTable.selectAll().single()[LoculusUsersTable.username],
            )
            assertEquals(1L, LoculusUsersTable.selectAll().count())
            assertEquals(1L, ExternalIdentitiesTable.selectAll().count())
            assertEquals("original@example.org", UserEmailTable.selectAll().single()[UserEmailTable.address])
            val linked = ExternalIdentitiesTable.selectAll().single()[ExternalIdentitiesTable.linkedAt]
            assertEquals(first.provisionedAt, linked)
        }
    }

    @Test
    fun `username is required and unique after lowercasing`() {
        val identity = ExternalIdentity(TEST_TOKEN_ISSUER, "one")
        database.create(identity, ProviderProfileSeed("Alice"))
        assertThrows<ExposedSQLException> {
            database.create(identity.copy(subject = "two"), ProviderProfileSeed("ALICE"))
        }
        assertThrows<IllegalArgumentException> { database.create(identity, ProviderProfileSeed(null)) }
        transaction {
            assertEquals("alice", LoculusUsersTable.selectAll().single()[LoculusUsersTable.username])
            assertEquals(1L, ExternalIdentitiesTable.selectAll().count())
        }
    }

    @Test
    fun `profile and email are seeded with provenance and nullable verification`() {
        for ((index, verified) in listOf(true, false, null).withIndex()) {
            val identity = ExternalIdentity(TEST_TOKEN_ISSUER, "subject-$index")
            val principal = database.create(
                identity,
                ProviderProfileSeed(
                    "user-$index",
                    "First",
                    "Last",
                    "Institute",
                    "0000-0000-0000-0001",
                    "user-$index@example.org",
                    verified,
                ),
            )
            transaction {
                val user = LoculusUsersTable.selectAll().where { LoculusUsersTable.id eq principal.userId }.single()
                assertEquals("First", user[LoculusUsersTable.givenName])
                assertEquals("Last", user[LoculusUsersTable.familyName])
                assertEquals("Institute", user[LoculusUsersTable.affiliation])
                assertEquals("0000-0000-0000-0001", user[LoculusUsersTable.orcidId])
                val email = UserEmailTable.selectAll().where { UserEmailTable.userId eq principal.userId }.single()
                assertEquals(verified, email[UserEmailTable.verified])
                assertEquals(identity.issuer, email[UserEmailTable.sourceIssuer])
                assertEquals(identity.subject, email[UserEmailTable.sourceSubject])
                assertEquals(principal.provisionedAt, email[UserEmailTable.importedAt])
            }
        }
    }

    @Test
    fun `failed email insertion rolls back user and external identity`() {
        transaction {
            exec(
                """create function fail_test_email() returns trigger language plpgsql as
                'begin raise exception ''test email failure''; end;'""",
            )
            exec(
                "create trigger fail_test_email before insert on user_emails " +
                    "for each row execute function fail_test_email()",
            )
        }
        try {
            assertThrows<ExposedSQLException> {
                database.create(
                    ExternalIdentity(TEST_TOKEN_ISSUER, "email-failure"),
                    ProviderProfileSeed("email-failure", email = "test@example.org"),
                )
            }
            transaction {
                assertEquals(0L, LoculusUsersTable.selectAll().count())
                assertEquals(0L, ExternalIdentitiesTable.selectAll().count())
                assertEquals(0L, UserEmailTable.selectAll().count())
            }
        } finally {
            transaction {
                exec("drop trigger fail_test_email on user_emails")
                exec("drop function fail_test_email()")
            }
        }
    }

    @Test
    fun `concurrent first requests resolve one user without orphans`() {
        val ready = CountDownLatch(8)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(8)
        try {
            val requests = (1..8).map {
                executor.submit<UUID> {
                    ready.countDown()
                    check(start.await(10, TimeUnit.SECONDS))
                    resolver.resolve(
                        Jwt.withTokenValue("test").header("alg", "RS256")
                            .issuer(TEST_TOKEN_ISSUER).subject("concurrent")
                            .claim("preferred_username", "testuser").build(),
                    ).userId
                }
            }
            assertTrue(ready.await(10, TimeUnit.SECONDS))
            start.countDown()
            val ids = requests.map { it.get(30, TimeUnit.SECONDS) }.toSet()
            assertEquals(1, ids.size)
            transaction {
                assertEquals(1L, LoculusUsersTable.selectAll().count())
                assertEquals(1L, ExternalIdentitiesTable.selectAll().count())
                assertEquals(ids.single(), ExternalIdentitiesTable.selectAll().single()[ExternalIdentitiesTable.userId])
            }
        } finally {
            start.countDown()
            executor.shutdownNow()
        }
    }
}
