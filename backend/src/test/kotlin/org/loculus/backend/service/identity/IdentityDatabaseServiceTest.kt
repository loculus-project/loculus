package org.loculus.backend.service.identity

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
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
        val first = database.create(identity, ProviderProfileSeed("original"))
        assertThrows<ExposedSQLException> { database.create(identity, ProviderProfileSeed("changed")) }
        assertEquals(first, database.find(identity))
        transaction {
            assertEquals(
                "original",
                LoculusUsersTable.selectAll().single()[LoculusUsersTable.username],
            )
            assertEquals(1L, LoculusUsersTable.selectAll().count())
            assertEquals(1L, ExternalIdentitiesTable.selectAll().count())
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
