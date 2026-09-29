package org.loculus.backend.query.store

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.lessThan
import org.hamcrest.Matchers.not
import org.jetbrains.exposed.v1.jdbc.transactions.TransactionManager
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.service.submission.CompressionDictService
import org.springframework.beans.factory.annotation.Autowired
import java.sql.Connection
import java.sql.Types

/**
 * Every metadata read path of [PostgresQueryStore] on the real (migrated) query_entries table, over every stored form:
 * zstd frames with and without a dictionary, and jsonb as written before V1.42 (with JSON nulls or missing keys), also
 * next to a stale frame. All read the same.
 */
@EndpointTest(
    properties = [
        "loculus.query-engine.enabled=true",
        "loculus.query-engine.projector-initial-delay-ms=3600000",
        "loculus.query-engine.projector-interval-ms=3600000",
    ],
)
class StoredMetadataReadTest(
    @Autowired private val store: PostgresQueryStore,
    @Autowired private val compressionDictService: CompressionDictService,
) {
    private val records = listOf(
        """{"accessionVersion":"A.1","age":7,"score":1.5,"flag":false,"nested":{"a":[1,null]}}""",
        """{"accessionVersion":"C.1","country":"Ä \"CH\"","long":"$LONG"}""",
    )

    @BeforeEach
    fun setup() {
        val samples = (0 until 200).map { """{"accessionVersion":"S$it.1","country":"C$it","age":$it}""".toByteArray() }
        val dictionary = StoredMetadata.trainDictionary(samples)!!
        val dictId = transaction { compressionDictService.getDictIdOrInsert(dictionary, "test metadata dictionary") }
        val withDictionary = StoredMetadataCompressor(dictId, dictionary)
        val withoutDictionary = StoredMetadataCompressor(null, null)
        sql { c ->
            c.createStatement().use { it.execute("truncate query_entries") }
            c.prepareStatement(
                "insert into query_entries (organism, id, accession, version, accession_version, metadata, " +
                    "metadata_zstd, metadata_dict_id) values (?, ?, ?, 1, ?, ?::jsonb, ?, ?)",
            ).use { ps ->
                fun insert(id: Int, jsonb: String?, frame: ByteArray?, dict: Int?) {
                    ps.setString(1, ORGANISM)
                    ps.setInt(2, id)
                    ps.setString(3, "A$id")
                    ps.setString(4, "A$id.1")
                    ps.setString(5, jsonb)
                    ps.setBytes(6, frame)
                    if (dict == null) ps.setNull(7, Types.INTEGER) else ps.setInt(7, dict)
                    ps.addBatch()
                }
                records.forEachIndexed { i, json ->
                    val base = 10 * i
                    insert(base + 1, null, withDictionary.compress(json.toByteArray()), dictId)
                    insert(base + 2, null, withoutDictionary.compress(json.toByteArray()), null)
                    insert(base + 3, json, null, null)
                    // V1.36 form: every field, nulls included
                    val withNulls = mapper.readTree(json) as ObjectNode
                    FIELDS.filter { !withNulls.has(it) }.forEach { withNulls.putNull(it) }
                    insert(base + 4, withNulls.toString(), null, null)
                    // jsonb written by older code (e.g. after a rollback) next to a frame from before: jsonb wins
                    insert(
                        base + 5,
                        json,
                        withDictionary.compress("""{"accessionVersion":"STALE"}""".toByteArray()),
                        dictId,
                    )
                }
                ps.executeBatch()
            }
        }
        withDictionary.close()
        withoutDictionary.close()
    }

    @Test
    fun `every stored form reads the same on every path`() {
        val fields = FIELDS
        val expected = listOf(
            listOf("A.1", null, "7", "1.5", "false", """{"a":[1,null]}""", null),
            listOf("C.1", "Ä \"CH\"", null, null, null, null, LONG),
        )
        val ids = intArrayOf(1, 2, 3, 4, 5, 11, 12, 13, 14, 15)
        val expectedRows = ids.map { expected[it / 10] }

        val streamed = mutableListOf<List<String?>>()
        store.streamMetadataFields(ORGANISM, ids, fields) { _, values -> streamed.add(values.toList()) }
        assertThat(streamed, equalTo(expectedRows))
        assertThat(store.readMetadataFields(ORGANISM, ids, fields).map { it.toList() }, equalTo(expectedRows))
        val chunks = mutableListOf<List<String?>>()
        store.streamMetadataFieldChunks(ORGANISM, ids, fields, { _, values -> values.map { it.toList() } }) {
            chunks.addAll(it)
        }
        assertThat(chunks, equalTo(expectedRows))
        // few fields take the same path
        assertThat(
            store.readMetadataFields(ORGANISM, ids, listOf("country")).map { it.toList() },
            equalTo(ids.map { listOf(expected[it / 10][1]) }),
        )

        val json = mutableListOf<String>()
        store.streamMetadataJson(ORGANISM, ids) { _, text -> json.add(text) }
        assertThat(json.size, equalTo(ids.size))
        json.filterIndexed { i, _ -> ids[i] % 10 >= 3 }.forEach { assertThat(it, not(containsString(":null,"))) }
    }

    @Test
    fun `frames are deterministic and a trained dictionary makes them much smaller`() {
        val samples = (0 until 500).map {
            """{"accessionVersion":"LOC_$it.1","geoLocCountry":"Country ${it % 20}","sampleCollectionDate":"2024-01-${
                10 + it % 18
            }","pangoLineage":"XBB.1.${it % 30}","hostNameScientific":"Homo sapiens"}""".toByteArray()
        }
        val dictionary = StoredMetadata.trainDictionary(samples)!!
        StoredMetadataCompressor(1, dictionary).use { a ->
            StoredMetadataCompressor(1, dictionary).use { b ->
                StoredMetadataCompressor(null, null).use { plain ->
                    val record = samples[7]
                    assertThat(a.compress(record).toList(), equalTo(b.compress(record).toList()))
                    assertThat(a.compress(record).size * 2, lessThan(plain.compress(record).size))
                    val decompressed = SequenceDecompressor(ZstdDictionaryCache { dictionary }).use {
                        String(it.buffer, 0, it.decompress(1, a.compress(record)))
                    }
                    assertThat(decompressed, equalTo(String(record)))
                }
            }
        }
    }

    private fun <T> sql(block: (Connection) -> T): T = transaction {
        block(TransactionManager.current().connection.connection as Connection)
    }

    private companion object {
        const val ORGANISM = "dummyOrganism"
        val FIELDS = listOf("accessionVersion", "country", "age", "score", "flag", "nested", "long")
        val mapper = ObjectMapper()
        val LONG = (1..3000).joinToString("") { (it * 7919 % 97).toString() }
    }
}
