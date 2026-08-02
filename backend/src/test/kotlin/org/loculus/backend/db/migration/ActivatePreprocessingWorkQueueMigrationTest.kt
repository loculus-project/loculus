package org.loculus.backend.db.migration

import org.awaitility.Awaitility.await
import org.flywaydb.core.Flyway
import org.flywaydb.core.api.MigrationVersion
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.testcontainers.postgresql.PostgreSQLContainer
import java.sql.Connection
import java.sql.DriverManager
import java.time.Duration
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

private const val MIGRATION_TIMEOUT_SECONDS = 30L

class ActivatePreprocessingWorkQueueMigrationTest {
    @Test
    fun `GIVEN a legacy claim is open WHEN migrating THEN wait before changing the queue`() {
        val postgres = PostgreSQLContainer("postgres:15.12")
        postgres.start()

        try {
            migrateTo(postgres, "1.35")
            postgres.connection().use(::insertSequenceEntry)

            val executor = Executors.newSingleThreadExecutor()
            try {
                postgres.connection().use { legacyBackend ->
                    legacyBackend.autoCommit = false
                    insertLegacyClaim(legacyBackend)

                    val migration = executor.submit { migrateTo(postgres, "1.36") }
                    postgres.connection().use { observer ->
                        await()
                            .atMost(Duration.ofSeconds(MIGRATION_TIMEOUT_SECONDS))
                            .until { migrationIsWaitingForQueueLock(observer) }
                    }
                    assertFalse(migration.isDone)

                    legacyBackend.commit()
                    migration.get(MIGRATION_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                }
            } finally {
                executor.shutdownNow()
                executor.awaitTermination(MIGRATION_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            }

            postgres.connection().use(::assertLegacyClaimWasMigrated)
            migrateTo(postgres, "1.38")
        } finally {
            postgres.stop()
        }
    }

    private fun migrateTo(postgres: PostgreSQLContainer, version: String) {
        Flyway.configure()
            .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            .locations("classpath:db/migration")
            .target(MigrationVersion.fromVersion(version))
            .load()
            .migrate()
    }

    private fun PostgreSQLContainer.connection(): Connection = DriverManager.getConnection(jdbcUrl, username, password)

    private fun insertSequenceEntry(connection: Connection) {
        connection.createStatement().use { statement ->
            statement.executeUpdate(
                """
                INSERT INTO groups_table (
                    group_id,
                    group_name,
                    institution,
                    address_line_1,
                    address_postal_code,
                    address_city,
                    address_country,
                    contact_email,
                    created_at
                ) VALUES (
                    1,
                    'migration-test',
                    'institution',
                    'address',
                    'postal-code',
                    'city',
                    'country',
                    'test@example.org',
                    now()
                )
                """.trimIndent(),
            )
            statement.executeUpdate(
                """
                INSERT INTO sequence_entries (
                    accession,
                    version,
                    organism,
                    submission_id,
                    submitter,
                    group_id,
                    submitted_at
                ) VALUES (
                    'LOC_1',
                    1,
                    'test-organism',
                    'submission',
                    'submitter',
                    1,
                    now()
                )
                """.trimIndent(),
            )
        }
    }

    private fun insertLegacyClaim(connection: Connection) {
        connection.createStatement().use { statement ->
            statement.executeUpdate(
                """
                INSERT INTO sequence_entries_preprocessed_data (
                    accession,
                    version,
                    pipeline_version,
                    processing_status,
                    started_processing_at
                ) VALUES (
                    'LOC_1',
                    1,
                    1,
                    'IN_PROCESSING',
                    now()
                )
                """.trimIndent(),
            )
        }
    }

    private fun migrationIsWaitingForQueueLock(connection: Connection): Boolean =
        connection.createStatement().use { statement ->
            statement.executeQuery(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_stat_activity
                    WHERE datname = current_database()
                      AND wait_event_type = 'Lock'
                      AND position(
                          'LOCK TABLE sequence_entries_preprocessed_data' IN query
                      ) > 0
                )
                """.trimIndent(),
            ).use { result ->
                assertTrue(result.next())
                result.getBoolean(1)
            }
        }

    private fun assertLegacyClaimWasMigrated(connection: Connection) {
        connection.createStatement().use { statement ->
            statement.executeQuery(
                """
                SELECT
                    organism,
                    processing_status,
                    processing_attempt_id,
                    lease_until,
                    started_processing_at
                FROM sequence_entries_preprocessed_data
                WHERE accession = 'LOC_1'
                  AND version = 1
                  AND pipeline_version = 1
                """.trimIndent(),
            ).use { result ->
                assertTrue(result.next())
                assertEquals("test-organism", result.getString("organism"))
                assertEquals("UNPROCESSED", result.getString("processing_status"))
                assertNull(result.getObject("processing_attempt_id"))
                assertNull(result.getObject("lease_until"))
                assertNull(result.getObject("started_processing_at"))
                assertFalse(result.next())
            }
        }
    }
}
