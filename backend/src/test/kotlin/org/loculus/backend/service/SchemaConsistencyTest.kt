package org.loculus.backend.service

import org.assertj.core.api.Assertions.assertThat
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.statements.StatementType
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.springframework.core.io.support.PathMatchingResourcePatternResolver
import org.springframework.core.type.classreading.CachingMetadataReaderFactory

/**
 * Asserts that the Exposed [Table] declarations agree with the schema the Flyway migrations actually
 * produce: same relations, same columns, same types, same nullability.
 *
 * Types are compared by materialising the Exposed declarations as real tables in a throwaway schema
 * and diffing the two schemas' catalogs, rather than by mapping Exposed's SQL type strings onto what
 * `information_schema` reports. That keeps Postgres in charge of normalisation, which is what makes
 * `character varying(255)` vs `text` and `text[]` vs `integer[]` comparable at all.
 *
 * Not compared: default values (too fragile to match as SQL text), indices, and constraint names.
 */
@EndpointTest
class SchemaConsistencyTest {

    @Test
    fun `GIVEN the migrated database THEN every declared relation exists in it`() {
        val existingRelations = transaction {
            val names = mutableSetOf<String>()
            exec(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()",
            ) { resultSet ->
                while (resultSet.next()) {
                    names.add(resultSet.getString("table_name"))
                }
            }
            names
        }!!

        val missing = declaredTables().map { it.tableName }.filterNot { it in existingRelations }

        assertThat(missing)
            .describedAs(
                "These Exposed objects name a relation that does not exist in the migrated database. " +
                    "Either a migration is missing, or the declaration is stale - which stays " +
                    "invisible until a query against it fails at runtime.",
            )
            .isEmpty()
    }

    @Test
    fun `GIVEN the migrated database THEN declared columns, types and nullability match it`() {
        val drift = transaction {
            exec(DROP_EXPECTED_SCHEMA)
            exec("""CREATE SCHEMA "$EXPECTED_SCHEMA"""")
            try {
                declaredTables().forEach { exec(expectedCreateTable(it)) }

                val rows = mutableListOf<ColumnDrift>()
                exec(DRIFT_QUERY, explicitStatementType = StatementType.SELECT) { resultSet ->
                    while (resultSet.next()) {
                        rows.add(
                            ColumnDrift(
                                table = resultSet.getString("table_name"),
                                column = resultSet.getString("column_name"),
                                declaredType = resultSet.getString("declared_type"),
                                declaredNullable = resultSet.getString("declared_nullable"),
                                actualType = resultSet.getString("actual_type"),
                                actualNullable = resultSet.getString("actual_nullable"),
                            ),
                        )
                    }
                }
                rows
            } finally {
                exec(DROP_EXPECTED_SCHEMA)
            }
        }!!.filterNot { (it.table to it.column) in KNOWN_DRIFT }

        assertThat(drift)
            .describedAs(
                "The Exposed table declarations disagree with the schema Flyway migrated to. Fix the " +
                    "declaration or add a migration. If a difference is deliberate, add it to " +
                    "KNOWN_DRIFT with a reason. `<absent>` means the column exists on only one side.",
            )
            .isEmpty()
    }

    /**
     * `descriptionDdl` omits `NOT NULL` for primary-key columns and only inlines `PRIMARY KEY` for
     * single-column keys, so for a composite key the constraint has to be restated here - otherwise
     * every key column is created nullable in the shadow schema and the nullability comparison
     * passes vacuously on most of the core tables.
     */
    private fun expectedCreateTable(table: Table): String {
        val columns = table.columns.map { it.descriptionDdl() }
        val compositeKey = table.primaryKey
            ?.columns
            ?.takeIf { it.size > 1 }
            ?.joinToString(", ") { "\"${it.name}\"" }
            ?.let { "PRIMARY KEY ($it)" }
        val body = (columns + listOfNotNull(compositeKey)).joinToString(", ")
        return """CREATE TABLE "$EXPECTED_SCHEMA"."${table.tableName}" ($body)"""
    }

    private fun declaredTables(): List<Table> = PathMatchingResourcePatternResolver()
        .getResources("classpath*:org/loculus/backend/**/*.class")
        .mapNotNull { resource ->
            val className = CachingMetadataReaderFactory().getMetadataReader(resource).classMetadata.className
            runCatching { Class.forName(className, false, javaClass.classLoader) }.getOrNull()
        }
        .filter { Table::class.java.isAssignableFrom(it) }
        .mapNotNull { it.kotlin.objectInstance as Table? }
        .also {
            assertThat(it.map { table -> table.tableName })
                .describedAs(
                    "The classpath scan only picks up Exposed tables declared as a Kotlin `object`; " +
                        "anything else is skipped silently, which would mean a table quietly stops " +
                        "being checked. Update EXPECTED_TABLES when adding or removing a table.",
                )
                .containsExactlyInAnyOrderElementsOf(EXPECTED_TABLES)
        }

    private data class ColumnDrift(
        val table: String,
        val column: String,
        val declaredType: String,
        val declaredNullable: String,
        val actualType: String,
        val actualNullable: String,
    ) {
        override fun toString() = "$table.$column: Exposed declares $declaredType " +
            "(nullable=$declaredNullable), database has $actualType (nullable=$actualNullable)"
    }

    companion object {
        private const val EXPECTED_SCHEMA = "exposed_expected"
        private const val DROP_EXPECTED_SCHEMA = """DROP SCHEMA IF EXISTS "$EXPECTED_SCHEMA" CASCADE"""

        /**
         * Every Exposed [Table] object expected on the classpath, asserted exactly rather than by
         * count so that a table dropping out of the scan is a failure rather than a silent gap.
         */
        private val EXPECTED_TABLES = listOf(
            "audit_log",
            "compression_dictionaries",
            "current_processing_pipeline",
            "data_use_terms_table",
            "external_metadata",
            "files",
            "groups_table",
            "metadata_upload_aux_table",
            "seqset_citation_source",
            "seqset_records",
            "seqset_to_citation_source",
            "seqset_to_records",
            "seqsets",
            "sequence_entries",
            "sequence_entries_preprocessed_data",
            "sequence_entries_view",
            "sequence_upload_aux_table",
            "table_update_tracker",
            "user_groups_table",
        )

        /**
         * The drift that exists on main today, recorded so that this test can start guarding against
         * *new* drift before the backlog is cleared. This is a baseline to burn down, not a list of
         * approved exceptions - every entry is a place where the Kotlin and the database disagree.
         *
         * Keyed on (table, column) rather than on the rendered difference, so that an entry keeps
         * applying if the mismatch changes shape; the trade-off is that a column listed here is
         * unguarded until its entry is removed. Deleting entries is the point.
         *
         * #7138 fixes a large share of the varchar/text and nullability groups below; the four
         * genuine type mismatches are not addressed by any open PR.
         */
        private val KNOWN_DRIFT = mapOf(
            // Exposed declares varchar(255) where the migrations created text. Harmless when reading, but
            // an insert longer than 255 chars would be rejected by Exposed, not by the database.
            ("current_processing_pipeline" to "organism") to "Exposed character varying(255), DB text",
            ("external_metadata" to "accession") to "Exposed character varying(255), DB text",
            ("external_metadata" to "external_metadata_updater") to "Exposed character varying(255), DB text",
            ("metadata_upload_aux_table" to "accession") to "Exposed character varying(255), DB text",
            ("metadata_upload_aux_table" to "organism") to "Exposed character varying(255), DB text",
            ("metadata_upload_aux_table" to "submission_id") to "Exposed character varying(255), DB text",
            ("metadata_upload_aux_table" to "submitter") to "Exposed character varying(255), DB text",
            ("metadata_upload_aux_table" to "upload_id") to "Exposed character varying(255), DB text",
            ("seqset_records" to "accession") to "Exposed character varying(255), DB text",
            ("seqset_records" to "type") to "Exposed character varying(255), DB text",
            ("seqset_to_records" to "seqset_id") to "Exposed character varying(255), DB text",
            ("seqsets" to "created_by") to "Exposed character varying(255), DB text",
            ("seqsets" to "description") to "Exposed character varying(255) NOT NULL, DB text nullable",
            ("seqsets" to "name") to "Exposed character varying(255), DB text",
            ("seqsets" to "seqset_doi") to "Exposed character varying(255), DB text",
            ("seqsets" to "seqset_id") to "Exposed character varying(255), DB text",
            ("sequence_entries" to "accession") to "Exposed character varying(255), DB text",
            ("sequence_entries" to "approver") to "Exposed character varying(255) NOT NULL, DB text nullable",
            ("sequence_entries" to "organism") to "Exposed character varying(255), DB text",
            ("sequence_entries" to "submission_id") to "Exposed character varying(255), DB text",
            ("sequence_entries" to "submitter") to "Exposed character varying(255), DB text",
            ("sequence_entries_preprocessed_data" to "accession") to "Exposed character varying(255), DB text",
            ("sequence_entries_preprocessed_data" to "processing_status") to "Exposed character varying(255), DB text",
            ("sequence_entries_view" to "accession") to "Exposed character varying(255), DB text",
            ("sequence_entries_view" to "organism") to "Exposed character varying(255), DB text",
            ("sequence_entries_view" to "processing_result") to "Exposed character varying(255), DB text",
            ("sequence_entries_view" to "status") to "Exposed character varying(255), DB text",
            ("sequence_entries_view" to "submission_id") to "Exposed character varying(255), DB text",
            ("sequence_entries_view" to "submitter") to "Exposed character varying(255), DB text",
            ("sequence_upload_aux_table" to "fasta_id") to "Exposed character varying(255), DB text",
            ("sequence_upload_aux_table" to "upload_id") to "Exposed character varying(255), DB text",

            // The mirror image: Exposed declares text where the migrations created varchar(255).
            ("groups_table" to "address_city") to "Exposed text, DB character varying(255)",
            ("groups_table" to "address_country") to "Exposed text, DB character varying(255)",
            ("groups_table" to "address_line_1") to "Exposed text, DB character varying(255)",
            ("groups_table" to "address_line_2") to "Exposed text NOT NULL, DB character varying(255) nullable",
            ("groups_table" to "address_postal_code") to "Exposed text, DB character varying(255)",
            ("groups_table" to "address_state") to "Exposed text NOT NULL, DB character varying(255) nullable",
            ("groups_table" to "contact_email") to "Exposed text, DB character varying(255)",
            ("groups_table" to "group_name") to "Exposed text NOT NULL, DB character varying(255) nullable",
            ("groups_table" to "institution") to "Exposed text, DB character varying(255)",

            // Nullability only: the type agrees, the NOT NULL does not.
            ("external_metadata" to "updated_metadata_at") to "Exposed nullable, DB NOT NULL",
            ("metadata_upload_aux_table" to "metadata") to "Exposed nullable, DB NOT NULL",
            ("sequence_entries_preprocessed_data" to "started_processing_at") to "Exposed nullable, DB NOT NULL",

            // Genuine type mismatches - the ones no varchar/text sweep would surface.
            ("compression_dictionaries" to "created_at") to
                "Exposed timestamp without time zone, DB timestamp with time zone",
            ("data_use_terms_table" to "restricted_until") to "Exposed date, DB timestamp without time zone",
            ("sequence_upload_aux_table" to "compressed_sequence_data") to "Exposed jsonb, DB text",
            ("table_update_tracker" to "last_time_updated") to
                "Exposed text NOT NULL, DB timestamp without time zone nullable",

            // Present in the view but deliberately not mapped.
            ("sequence_entries_view" to "approver") to "not declared in Exposed",
        )

        private val DRIFT_QUERY = """
            WITH views AS (
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = current_schema() AND table_type = 'VIEW'
            ),
            signature AS (
                SELECT c.table_schema,
                       c.table_name,
                       c.column_name,
                       -- Postgres reports every column of a view as nullable no matter what the
                       -- underlying table declares, so nullability is only comparable for real
                       -- tables. Keyed on the relation in the migrated schema so that both sides of
                       -- the comparison are masked alike.
                       CASE WHEN c.table_name IN (SELECT table_name FROM views)
                            THEN NULL
                            ELSE c.is_nullable
                       END AS nullable,
                       -- format_type keeps the type modifier and renders arrays as e.g. text[];
                       -- information_schema.data_type drops the modifier and collapses every array
                       -- type to the string 'ARRAY'.
                       format_type(a.atttypid, a.atttypmod) AS type
                FROM information_schema.columns c
                JOIN pg_class rel
                  ON rel.relname = c.table_name
                 AND rel.relnamespace = c.table_schema::regnamespace
                JOIN pg_attribute a
                  ON a.attrelid = rel.oid AND a.attname = c.column_name
                WHERE c.table_schema IN (current_schema(), '$EXPECTED_SCHEMA')
            ),
            declared AS (
                SELECT table_name, column_name, nullable, type
                FROM signature
                WHERE table_schema = '$EXPECTED_SCHEMA'
            ),
            actual AS (
                SELECT table_name, column_name, nullable, type
                FROM signature
                WHERE table_schema = current_schema()
                  -- Only relations that an Exposed object maps onto; raw-SQL-only tables such as
                  -- task_lock and flyway's own history table are none of this test's business.
                  AND table_name IN (SELECT table_name FROM declared)
            )
            SELECT table_name,
                   column_name,
                   COALESCE(d.type, '<absent>')  AS declared_type,
                   COALESCE(d.nullable, '-')     AS declared_nullable,
                   COALESCE(a.type, '<absent>')  AS actual_type,
                   COALESCE(a.nullable, '-')     AS actual_nullable
            FROM declared d
            FULL OUTER JOIN actual a USING (table_name, column_name)
            WHERE (d.type, d.nullable) IS DISTINCT FROM (a.type, a.nullable)
            ORDER BY table_name, column_name
        """.trimIndent()
    }
}
