package org.loculus.backend.query.index

import io.mockk.every
import io.mockk.mockk
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.loculus.backend.query.QueryEngineProperties
import org.loculus.backend.query.QuerySchemaRegistry
import org.loculus.backend.query.filter.StringEquals
import org.loculus.backend.query.filter.True
import org.springframework.jdbc.datasource.DriverManagerDataSource
import java.sql.DriverManager

/**
 * End-to-end: full load from the projection tables, then changelog tailing (upsert, delete, data version).
 * Uses a throwaway schema in the database given by QUERY_INDEX_PG_URL (opt-in, see ProjectionReaderPostgresTest).
 */
@EnabledIfEnvironmentVariable(named = "QUERY_INDEX_PG_URL", matches = ".+")
class QueryIndexServicePostgresTest {
    private val schema = IndexTestSupport.schema()
    private val url = System.getenv("QUERY_INDEX_PG_URL")
    private val dbSchema = "query_index_test_${System.nanoTime()}"

    private fun sql(vararg statements: String) = DriverManager.getConnection(url).use { c ->
        c.createStatement().use { st -> statements.forEach { st.execute(it) } }
    }

    private fun entry(id: Int, country: String) =
        "('test', $id, 'A$id', 1, 'A$id.1', '{\"accessionVersion\":\"A$id.1\",\"country\":\"$country\"}')"

    private fun awaitUntil(message: String, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + 20_000
        while (!condition()) {
            check(System.currentTimeMillis() < deadline) { "timeout waiting for $message" }
            Thread.sleep(20)
        }
    }

    private fun createTables() = sql(
        "create schema $dbSchema",
        "set search_path to $dbSchema",
        "create table $dbSchema.query_entries (organism text, id int, accession text, version bigint, " +
            "accession_version text, metadata jsonb, metadata_zstd bytea, metadata_dict_id int, primary key (organism, id))",
        "create table $dbSchema.query_mutation_data (organism text, id int, present_sequences int[], " +
            "mutations int[], missing int[], insertions text[], primary key (organism, id))",
        "create table $dbSchema.query_changelog (seq bigserial primary key, organism text, id int, " +
            "created_at timestamp default now())",
        "create table $dbSchema.query_engine_state (organism text primary key, data_version bigint, " +
            "encoding_hash text)",
    )

    @Test
    fun `a large batch reloads into a new index and keeps the organism ready`() {
        createTables()
        sql(
            "insert into $dbSchema.query_entries values ${entry(0, "CH")}, ${entry(1, "DE")}",
            "insert into $dbSchema.query_engine_state values ('test', 100)",
            "insert into $dbSchema.query_changelog (organism, id) values ('test', 0), ('test', 1)",
        )
        val dataSource = DriverManagerDataSource("$url&currentSchema=$dbSchema")
        val registry = mockk<QuerySchemaRegistry> { every { schemas } returns mapOf("test" to schema) }
        val service =
            QueryIndexService(registry, dataSource, QueryEngineProperties(enabled = true, tailIntervalMs = 20))
        try {
            service.start()
            awaitUntil("initial load") { service.get("test") != null }
            val old = service.get("test")!!
            sql(
                "insert into $dbSchema.query_entries values ${entry(5, "FR")}",
                "update $dbSchema.query_engine_state set data_version = 200",
                "insert into $dbSchema.query_changelog (organism, id) " +
                    "select 'test', 5 from generate_series(1, ${QueryIndexService.REBUILD_MIN_CHANGES + 1})",
            )
            awaitUntil("reload") { service.get("test").let { it != null && it !== old } }
            val reloaded = service.get("test")!!
            assertThat(reloaded.dataVersion, equalTo(200L))
            assertThat(reloaded.evaluate(True).toArray().toList(), contains(0, 1, 5))
            assertThat(service.organismsNotLoaded(), equalTo(emptyList()))
        } finally {
            service.destroy()
            sql("drop schema $dbSchema cascade")
        }
    }

    @Test
    fun `loads and tails the changelog`() {
        sql(
            "create schema $dbSchema",
            "set search_path to $dbSchema",
            "create table $dbSchema.query_entries (organism text, id int, accession text, version bigint, " +
                "accession_version text, metadata jsonb, metadata_zstd bytea, metadata_dict_id int, primary key (organism, id))",
            "create table $dbSchema.query_mutation_data (organism text, id int, present_sequences int[], " +
                "mutations int[], missing int[], insertions text[], primary key (organism, id))",
            "create table $dbSchema.query_changelog (seq bigserial primary key, organism text, id int, " +
                "created_at timestamp default now())",
            "create table $dbSchema.query_engine_state (organism text primary key, data_version bigint, " +
                "encoding_hash text)",
            "insert into $dbSchema.query_entries values ${entry(0, "CH")}, ${entry(1, "DE")}, ${entry(2, "CH")}",
            "insert into $dbSchema.query_engine_state values ('test', 100)",
            "insert into $dbSchema.query_changelog (organism, id) values ('test', 0), ('test', 1), ('test', 2)",
        )
        val dataSource = DriverManagerDataSource("$url&currentSchema=$dbSchema")
        val registry = mockk<QuerySchemaRegistry> { every { schemas } returns mapOf("test" to schema) }
        val service =
            QueryIndexService(registry, dataSource, QueryEngineProperties(enabled = true, tailIntervalMs = 20))
        try {
            service.start()
            awaitUntil("initial load") { service.get("test") != null }
            val index = service.get("test")!!
            assertThat(index.dataVersion, equalTo(100L))
            assertThat(index.evaluate(StringEquals("country", "CH")).toArray().toList(), contains(0, 2))

            sql(
                "update $dbSchema.query_entries set metadata = '{\"country\":\"FR\"}' where id = 0",
                "delete from $dbSchema.query_entries where id = 1",
                "insert into $dbSchema.query_entries values ${entry(5, "CH")}",
                "update $dbSchema.query_engine_state set data_version = 200",
                "insert into $dbSchema.query_changelog (organism, id) values ('test', 0), ('test', 1), ('test', 5)",
            )
            awaitUntil("changes applied") { index.dataVersion == 200L }
            assertThat(index.evaluate(True).toArray().toList(), contains(0, 2, 5))
            assertThat(index.evaluate(StringEquals("country", "CH")).toArray().toList(), contains(2, 5))
            assertThat(index.value(0, "country"), equalTo("FR"))
        } finally {
            service.destroy()
            sql("drop schema $dbSchema cascade")
        }
    }
}
