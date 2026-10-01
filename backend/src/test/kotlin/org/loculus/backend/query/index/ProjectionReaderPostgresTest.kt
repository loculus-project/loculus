package org.loculus.backend.query.index

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.loculus.backend.query.filter.SymbolEquals
import org.loculus.backend.query.schema.MutationCode
import org.loculus.backend.query.store.StoredMetadata
import org.loculus.backend.query.store.StoredMetadataCompressor
import org.loculus.backend.query.store.ZstdDictionaryCache
import java.sql.DriverManager

/**
 * Checks [ProjectionReader] (binary array decoding, JSON metadata parsing) against a real Postgres using
 * temporary tables shaped like the V1.36 projection tables. Opt-in:
 *   QUERY_INDEX_PG_URL=jdbc:postgresql://localhost:5433/loculus?user=postgres&password=password
 */
@EnabledIfEnvironmentVariable(named = "QUERY_INDEX_PG_URL", matches = ".+")
class ProjectionReaderPostgresTest {
    private val schema = IndexTestSupport.schema()

    @Test
    fun `reads rows written like the projector writes them`() {
        DriverManager.getConnection(System.getenv("QUERY_INDEX_PG_URL")).use { c ->
            c.createStatement().use { st ->
                st.execute(
                    "create temp table query_entries (organism text, id int, accession text, version bigint, " +
                        "accession_version text, metadata jsonb, metadata_zstd bytea, metadata_dict_id int, primary key (organism, id))",
                )
                st.execute(
                    "create temp table query_mutation_data (organism text, id int, present_sequences int[], " +
                        "mutations int[], missing int[], insertions text[], primary key (organism, id))",
                )
                val code = MutationCode.encode(0, 21, 4)
                st.execute(
                    """
                    insert into query_entries values
                      ('test', 1, 'A', 1, 'A.1', '{"accessionVersion":"A.1","country":"Ä \"x\"","age":7,
                        "score":1.25,"date":"2021-03-04","isRevocation":true,"unknownField":{"a":[1]}}'),
                      ('test', 2, 'B', 1, 'B.1', '{"accessionVersion":"B.1","country":null}'),
                      ('other', 1, 'C', 1, 'C.1', '{}');
                    insert into query_mutation_data values
                      ('test', 1, '{0,1}', '{$code}', '{0,1,5,1,3,4}', '{"0:10:ACG","1:3:EP*"}');
                    """.trimIndent(),
                )
            }
            // records as the projector writes them since V1.42: zstd frames, with and without a dictionary
            val samples = (0 until 50).map {
                """{"accessionVersion":"S$it.1","country":"Country $it","age":$it}""".toByteArray()
            }
            val dictionary = StoredMetadata.trainDictionary(samples)!!
            val json = """{"accessionVersion":"D.1","country":"Ä","age":8}""".toByteArray()
            c.prepareStatement("insert into query_entries values ('test', ?, 'D', 1, 'D.1', null, ?, ?)").use { ps ->
                StoredMetadataCompressor(7, dictionary).use { compressor ->
                    ps.setInt(1, 3)
                    ps.setBytes(2, compressor.compress(json))
                    ps.setInt(3, 7)
                    ps.executeUpdate()
                }
                StoredMetadataCompressor(null, null).use { compressor ->
                    ps.setInt(1, 4)
                    ps.setBytes(2, compressor.compress(json))
                    ps.setNull(3, java.sql.Types.INTEGER)
                    ps.executeUpdate()
                }
            }
            val reader = ProjectionReader(schema, ZstdDictionaryCache { id -> dictionary.also { check(id == 7) } })
            val rows = mutableListOf<IndexRow>()
            reader.streamAll(c) { rows.add(it) }
            assertThat(rows.map { it.id }, contains(1, 2, 3, 4))
            for (row in rows.subList(2, 4)) {
                assertThat(row.values.toList(), contains<Any?>("D.1", "Ä", null, 8L, null, null, null))
            }
            val first = rows[0]
            assertThat(
                first.values.toList(),
                contains<Any?>("A.1", "Ä \"x\"", null, 7L, 1.25, "2021-03-04", true),
            )
            assertThat(first.presentSequences.toList(), contains(0, 1))
            assertThat(first.mutations.toList(), contains(MutationCode.encode(0, 21, 4)))
            assertThat(first.missing.toList(), contains(0, 1, 5, 1, 3, 4))
            assertThat(first.insertions, contains("0:10:ACG", "1:3:EP*"))
            assertThat(rows[1].presentSequences.size, equalTo(0))
            assertThat(rows[1].values[1], equalTo(null))

            assertThat(reader.readIds(c, listOf(2, 5)).map { it.id }, contains(2))

            val index = InMemoryOrganismIndex.build(schema, rows)
            assertThat(index.evaluate(SymbolEquals(0, 21, 4)).toArray().toList(), contains(1))
            assertThat(index.evaluate(SymbolEquals(0, 2, 15)).toArray().toList(), contains(1))
            assertThat(index.value(1, "date"), equalTo("2021-03-04"))
        }
    }
}
