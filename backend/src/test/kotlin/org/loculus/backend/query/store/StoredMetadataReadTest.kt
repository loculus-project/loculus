package org.loculus.backend.query.store

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.not
import org.jetbrains.exposed.v1.jdbc.transactions.TransactionManager
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.springframework.beans.factory.annotation.Autowired
import java.sql.Connection

/**
 * Every metadata read path of [PostgresQueryStore] on the real (migrated) query_entries table: a key stored with a
 * JSON null and a missing key read the same.
 */
@EndpointTest(
    properties = [
        "loculus.query-engine.enabled=true",
        "loculus.query-engine.projector-initial-delay-ms=3600000",
        "loculus.query-engine.projector-interval-ms=3600000",
    ],
)
class StoredMetadataReadTest(@Autowired private val store: PostgresQueryStore) {
    @BeforeEach
    fun setup() {
        sql { c ->
            c.createStatement().use { it.execute("truncate query_entries") }
            // incompressible records above the size limit that switches >3-field reads to JVM extraction
            val random = java.util.Random(1)
            val pad = (1..2000).map { "0123456789abcdef"[random.nextInt(16)] }.joinToString("")
            c.prepareStatement(
                "insert into query_entries (organism, id, accession, version, accession_version, metadata) " +
                    "values (?, ?, ?, 1, ?, ?::jsonb)",
            ).use { ps ->
                for ((id, json) in listOf(
                    1 to """{"accessionVersion":"A.1","country":null,"age":7,"score":1.5,"flag":false,"pad":"$pad"}""",
                    2 to """{"accessionVersion":"A.1","age":7,"score":1.5,"flag":false,"pad":"$pad"}""",
                    3 to
                        """{"accessionVersion":"C.1","country":"CH","age":null,"score":null,"flag":null,"pad":"$pad"}""",
                )) {
                    ps.setString(1, ORGANISM)
                    ps.setInt(2, id)
                    ps.setString(3, "A$id")
                    ps.setString(4, "A$id.1")
                    ps.setString(5, json)
                    ps.addBatch()
                }
                ps.executeBatch()
            }
        }
    }

    @Test
    fun `a JSON null and a missing key read the same on every path`() {
        val ids = intArrayOf(1, 2, 3)
        val expected = listOf(
            listOf("A.1", null, "7", "1.5", "false"),
            listOf("A.1", null, "7", "1.5", "false"),
            listOf("C.1", "CH", null, null, null),
        )
        val fields = listOf("accessionVersion", "country", "age", "score", "flag")
        assertThat(store.extractInJvm(ORGANISM, fields), equalTo(true))

        val streamed = mutableListOf<List<String?>>()
        store.streamMetadataFields(ORGANISM, ids, fields) { _, values -> streamed.add(values.toList()) }
        assertThat(streamed, equalTo(expected))
        assertThat(store.readMetadataFields(ORGANISM, ids, fields).map { it.toList() }, equalTo(expected))
        val chunks = mutableListOf<List<String?>>()
        store.streamMetadataFieldChunks(ORGANISM, ids, fields, { _, values -> values.map { it.toList() } }) {
            chunks.addAll(it)
        }
        assertThat(chunks, equalTo(expected))

        // up to 3 fields are extracted by Postgres
        val few = listOf("country", "age", "flag")
        assertThat(store.extractInJvm(ORGANISM, few), equalTo(false))
        assertThat(
            store.readMetadataFields(ORGANISM, ids, few).map { it.toList() },
            contains(listOf(null, "7", "false"), listOf(null, "7", "false"), listOf("CH", null, null)),
        )

        val json = mutableListOf<String>()
        store.streamMetadataJson(ORGANISM, ids) { _, text -> json.add(text) }
        assertThat(json[0], equalTo(json[1]))
        json.forEach { assertThat(it, not(containsString("null"))) }
    }

    private fun <T> sql(block: (Connection) -> T): T = transaction {
        block(TransactionManager.current().connection.connection as Connection)
    }

    private companion object {
        const val ORGANISM = "dummyOrganism"
    }
}
