package org.loculus.backend.config

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.migration.jdbc.MigrationUtils
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider
import org.springframework.core.type.filter.AssignableTypeFilter

/**
 * Marker for Exposed [Table] objects that do NOT map onto a table Flyway is expected to have created, e.g.
 * because they map onto a database VIEW instead (see [org.loculus.backend.service.submission.SequenceEntriesView]).
 *
 * Every other [Table] object under `org.loculus.backend` is assumed to be Flyway-managed and is
 * automatically discovered and verified by [checkExposedSchemaMatchesDatabase] on startup - there's nothing
 * to register when adding a normal new table.
 */
interface NotFlywayManaged

private const val BASE_PACKAGE = "org.loculus.backend"

private fun discoverFlywayManagedTables(): List<Table> {
    val scanner = ClassPathScanningCandidateComponentProvider(false).apply {
        addIncludeFilter(AssignableTypeFilter(Table::class.java))
    }
    return scanner.findCandidateComponents(BASE_PACKAGE)
        .mapNotNull { Class.forName(it.beanClassName).kotlin.objectInstance as? Table }
        .filterNot { it is NotFlywayManaged }
}

/**
 * Verifies that every Flyway-managed Exposed table (i.e. every [Table] object under `org.loculus.backend`
 * that isn't marked [NotFlywayManaged]) matches the database schema that Flyway just migrated to.
 *
 * Must be called within a transaction, after `flyway.migrate()`. Throws if Exposed and the database
 * schema have drifted apart, e.g. because a Flyway migration was added/changed without updating the
 * corresponding Exposed `Table` object, or vice versa.
 */
fun checkExposedSchemaMatchesDatabase() {
    val tables = discoverFlywayManagedTables()
    check(tables.isNotEmpty()) {
        "No Flyway-managed Exposed tables found on the classpath under $BASE_PACKAGE - " +
            "the classpath scan is likely misconfigured."
    }

    val requiredStatements = MigrationUtils.statementsRequiredForDatabaseMigration(*tables.toTypedArray())
    check(requiredStatements.isEmpty()) {
        "Exposed table definitions are out of sync with the database schema created by Flyway migrations. " +
            "Either a Flyway migration is missing a corresponding Exposed table change, or vice versa. " +
            "Statements required to reconcile Exposed with the database:\n" +
            requiredStatements.joinToString("\n")
    }
}
