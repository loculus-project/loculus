package org.loculus.backend.service

import org.assertj.core.api.Assertions.assertThat
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.springframework.core.io.support.PathMatchingResourcePatternResolver
import org.springframework.core.type.classreading.CachingMetadataReaderFactory

@EndpointTest
class SchemaConsistencyTest {

    @Test
    fun `GIVEN the migrated database THEN every declared column exists in it`() {
        val existingColumns = existingColumns()

        val missing = declaredTables().flatMap { table ->
            val existing = existingColumns[table.tableName]
                ?: return@flatMap listOf("${table.tableName} (no such table or view)")
            table.columns.map { it.name }.filterNot { it in existing }.map { "${table.tableName}.$it" }
        }

        assertThat(missing)
            .describedAs(
                "These columns are declared in Exposed but do not exist in the migrated database. Either a " +
                    "migration is missing, or the declaration is stale - which stays invisible until a query " +
                    "selects all columns of the table and then fails at runtime.",
            )
            .isEmpty()
    }

    @Test
    fun `GIVEN the migrated database THEN every column of a mapped table is declared`() {
        val existingColumns = existingColumns()

        val undeclared = declaredTables().flatMap { table ->
            val declared = table.columns.map { it.name }.toSet()
            existingColumns[table.tableName].orEmpty()
                .filterNot { it in declared }
                .map { "${table.tableName}.$it" }
        } - COLUMNS_INTENTIONALLY_NOT_MAPPED

        assertThat(undeclared)
            .describedAs(
                "The migrated database has these columns, but the Exposed object for that table does not " +
                    "declare them, so no query can read them. Either add the declaration, or - if the column " +
                    "is deliberately only used from raw SQL or not used at all - list it in " +
                    "COLUMNS_INTENTIONALLY_NOT_MAPPED.",
            )
            .isEmpty()
    }

    private fun existingColumns(): Map<String, Set<String>> = transaction {
        val columnsByTable = mutableMapOf<String, MutableSet<String>>()
        exec(
            "SELECT table_name, column_name FROM information_schema.columns " +
                "WHERE table_schema = current_schema()",
        ) { resultSet ->
            while (resultSet.next()) {
                columnsByTable
                    .getOrPut(resultSet.getString("table_name")) { mutableSetOf() }
                    .add(resultSet.getString("column_name"))
            }
        }
        columnsByTable
    }!!

    private fun declaredTables(): List<Table> = PathMatchingResourcePatternResolver()
        .getResources("classpath*:org/loculus/backend/**/*.class")
        .mapNotNull { resource ->
            val className = CachingMetadataReaderFactory().getMetadataReader(resource).classMetadata.className
            runCatching { Class.forName(className, false, javaClass.classLoader) }.getOrNull()
        }
        .filter { Table::class.java.isAssignableFrom(it) }
        .mapNotNull { it.kotlin.objectInstance as Table? }
        .also { assertThat(it).hasSizeGreaterThan(10) }

    companion object {
        private val COLUMNS_INTENTIONALLY_NOT_MAPPED = setOf(
            "sequence_entries_view.approver",
        )
    }
}
