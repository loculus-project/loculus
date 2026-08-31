@file:OptIn(ExperimentalDatabaseMigrationApi::class)

package org.loculus.backend.tools

import org.flywaydb.core.Flyway
import org.jetbrains.exposed.v1.core.ExperimentalDatabaseMigrationApi
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.jdbc.Database
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.migration.jdbc.MigrationUtils
import org.loculus.backend.log.AuditLogTable
import org.loculus.backend.service.datauseterms.DataUseTermsTable
import org.loculus.backend.service.files.FilesTable
import org.loculus.backend.service.groupmanagement.GroupsTable
import org.loculus.backend.service.groupmanagement.UserGroupsTable
import org.loculus.backend.service.seqsetcitations.SeqSetCitationSourceTable
import org.loculus.backend.service.seqsetcitations.SeqSetRecordsTable
import org.loculus.backend.service.seqsetcitations.SeqSetToCitationSourceTable
import org.loculus.backend.service.seqsetcitations.SeqSetToRecordsTable
import org.loculus.backend.service.seqsetcitations.SeqSetsTable
import org.loculus.backend.service.submission.MetadataUploadAuxTable
import org.loculus.backend.service.submission.SequenceEntriesPreprocessedDataTable
import org.loculus.backend.service.submission.SequenceEntriesTable
import org.loculus.backend.service.submission.SequenceUploadAuxTable
import org.loculus.backend.service.submission.UpdateTrackerTable
import org.loculus.backend.service.submission.dbtables.CompressionDictionariesTable
import org.loculus.backend.service.submission.dbtables.CurrentProcessingPipelineTable
import org.loculus.backend.service.submission.dbtables.ExternalMetadataTable
import org.loculus.backend.testutil.TestEnvironment

const val MIGRATIONS_DIRECTORY = "src/main/resources/db/migration"

private val tables: Array<Table> = arrayOf(
    AuditLogTable,
    CompressionDictionariesTable,
    CurrentProcessingPipelineTable,
    DataUseTermsTable,
    ExternalMetadataTable,
    FilesTable,
    GroupsTable,
    MetadataUploadAuxTable,
    SeqSetCitationSourceTable,
    SeqSetRecordsTable,
    SeqSetToCitationSourceTable,
    SeqSetToRecordsTable,
    SeqSetsTable,
    SequenceEntriesPreprocessedDataTable,
    SequenceEntriesTable,
    SequenceUploadAuxTable,
    UpdateTrackerTable,
    UserGroupsTable,
)

fun main(args: Array<String>) {
    val scriptName = args.firstOrNull() ?: "generated_migration"

    val postgres = TestEnvironment().postgres
    postgres.start()
    try {
        Flyway.configure()
            .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            .locations("classpath:db/migration", "classpath:org/loculus/backend/db/migration")
            .baselineOnMigrate(true)
            .load()
            .migrate()

        val database = Database.connect(
            url = postgres.jdbcUrl,
            user = postgres.username,
            password = postgres.password,
            driver = "org.postgresql.Driver",
        )

        transaction(database) {
            val script = MigrationUtils.generateMigrationScript(
                *tables,
                scriptDirectory = MIGRATIONS_DIRECTORY,
                scriptName = scriptName,
            )
            println("Wrote ${script.absolutePath}")
        }
    } finally {
        postgres.stop()
    }
}
