package org.loculus.backend.query.store

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.loculus.backend.query.api.FakeIndex
import org.loculus.backend.query.api.LapisInfo
import org.loculus.backend.query.api.LapisQueryExecutor
import org.loculus.backend.query.request.DataFormat
import org.loculus.backend.query.request.Endpoint
import org.loculus.backend.query.request.QueryRequest
import org.loculus.backend.query.schema.FieldType
import org.loculus.backend.query.schema.MetadataField
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.schema.SequenceSchema
import org.loculus.backend.query.schema.SequenceType
import org.loculus.backend.service.submission.CompressionDictService
import java.io.OutputStream
import java.sql.Connection
import java.sql.DriverManager

/**
 * Manual throughput benchmark against a real database holding the prototype tables qe.seqs_dummy_organism /
 * qe.entries_dummy_organism (only read: they are copied once into UNLOGGED tables named like the query engine
 * tables in the separate schema qe_bench; drop it with `drop schema qe_bench cascade`). Run with e.g.
 *   QUERY_ENGINE_BENCHMARK_DB='jdbc:postgresql://localhost:5433/loculus?user=postgres&password=password' \
 *   ./gradlew test --tests 'org.loculus.backend.query.store.PostgresQueryStoreBenchmark'
 */
@EnabledIfEnvironmentVariable(named = "QUERY_ENGINE_BENCHMARK_DB", matches = ".+")
class PostgresQueryStoreBenchmark {
    private val organism = "dummy-organism"

    @Test
    fun benchmark() {
        val url = System.getenv("QUERY_ENGINE_BENCHMARK_DB")
        val connection = DriverManager.getConnection(url)
        prepareTables(connection)
        val dataSource = HikariDataSource(
            HikariConfig().apply {
                jdbcUrl = url + (if ('?' in url) "&" else "?") + "currentSchema=qe_bench"
                maximumPoolSize = 10
            },
        )
        val dictService = mockk<CompressionDictService>()
        every { dictService.getDictById(any()) } answers {
            connection.prepareStatement("select dict_contents from compression_dictionaries where id = ?").use {
                it.setInt(1, firstArg())
                it.executeQuery().use { rs ->
                    rs.next()
                    rs.getBytes(1)
                }
            }
        }
        val store = PostgresQueryStore(dataSource, dictService, ExportChunkLimiter.unlimited())
        val ids = connection.createStatement().use { st ->
            st.executeQuery("select id from qe_bench.query_sequences where kind = 1 order by id").use { rs ->
                buildList { while (rs.next()) add(rs.getInt(1)) }.toIntArray()
            }
        }
        println("benchmark: ${ids.size} ids")

        repeat(2) { round ->
            measure("[$round] streamSequences aligned, all ids ascending", ids.size) {
                var bytes = 0L
                store.streamSequences(organism, SequenceKind.ALIGNED_NUCLEOTIDE, listOf(0), ids) { _, _, _, length ->
                    bytes += length
                }
                "decompressed ${bytes / 1_000_000} MB"
            }
        }
        val shuffled = ids.toList().shuffled(kotlin.random.Random(1)).take(100_000).toIntArray()
        measure("streamSequences aligned, 100k ids in random order", shuffled.size) {
            var n = 0
            store.streamSequences(organism, SequenceKind.ALIGNED_NUCLEOTIDE, listOf(0), shuffled) { _, _, _, _ -> n++ }
            "$n sequences"
        }
        measure("streamSequences unaligned, all ids ascending", ids.size) {
            var n = 0
            store.streamSequences(organism, SequenceKind.UNALIGNED_NUCLEOTIDE, listOf(0), ids) { _, _, _, _ -> n++ }
            "$n sequences"
        }

        val schema = schema(connection)
        val index = FakeIndex(schema, emptyMap(), selectResult = ids)
        val executor = LapisQueryExecutor(store)
        val info = { LapisInfo("1", "r", "bench") }
        measure("FASTA aligned via executor (header {accessionVersion})", ids.size) {
            val request = QueryRequest(
                Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES,
                dataFormat = DataFormat.FASTA,
                sequenceIndices = listOf(0),
                fastaHeaderTemplate = "{accessionVersion}",
            )
            val out = CountingOutputStream()
            executor.execute(organism, index, request, info).write(out)
            "${out.count / 1_000_000} MB written"
        }
        measure("FASTA aligned via executor (header {accessionVersion}|{country}|{date})", ids.size) {
            val request = QueryRequest(
                Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES,
                dataFormat = DataFormat.FASTA,
                sequenceIndices = listOf(0),
                fastaHeaderTemplate = "{accessionVersion}|{country}|{date}",
            )
            val out = CountingOutputStream()
            executor.execute(organism, index, request, info).write(out)
            "${out.count / 1_000_000} MB written"
        }
        measure("details JSON, all fields, via executor", ids.size) {
            val out = CountingOutputStream()
            executor.execute(organism, index, QueryRequest(Endpoint.DETAILS), info).write(out)
            "${out.count / 1_000_000} MB written"
        }
        measure("details CSV, 3 fields, via executor", ids.size) {
            val out = CountingOutputStream()
            executor.execute(
                organism,
                index,
                QueryRequest(
                    Endpoint.DETAILS,
                    fields = listOf("accessionVersion", "country", "date"),
                    dataFormat = DataFormat.CSV,
                ),
                info,
            ).write(out)
            "${out.count / 1_000_000} MB written"
        }
        dataSource.close()
        connection.close()
    }

    private fun measure(name: String, n: Int, block: () -> String) {
        val start = System.nanoTime()
        val detail = block()
        val seconds = (System.nanoTime() - start) / 1e9
        println("benchmark: %-75s %8.2f s %10.0f rows/s  (%s)".format(name, seconds, n / seconds, detail))
    }

    private fun prepareTables(connection: Connection) {
        connection.createStatement().use { st ->
            val exists = st.executeQuery("select to_regclass('qe_bench.query_entries') is not null").use {
                it.next()
                it.getBoolean(1)
            }
            if (exists) return
            val start = System.nanoTime()
            st.execute("create schema qe_bench")
            st.execute(
                """
                create unlogged table qe_bench.query_sequences as
                select '$organism'::text as organism,
                       (case name_id when 0 then 1 when 1 then 0 else 2 end)::smallint as kind,
                       (case when name_id <= 1 then 0 else name_id - 1 end)::smallint as sequence_index,
                       id, dict_id as compression_dict_id, data
                from qe.seqs_dummy_organism where name_id <= 1
                """.trimIndent(),
            )
            st.execute("alter table qe_bench.query_sequences alter column data set storage external")
            st.execute("alter table qe_bench.query_sequences add primary key (organism, kind, sequence_index, id)")
            // the LAPIS record only (the prototype table also holds mutation lists)
            st.execute(
                """
                create unlogged table qe_bench.query_entries as
                select '$organism'::text as organism, e.id, e.accession, e.version,
                       e."accessionVersion" as accession_version,
                       to_jsonb(e) - 'id' - 'nuc_muts' - 'aa_muts' - 'nuc_ins' - 'aa_ins' - 'nuc_missing' -
                           'aa_missing' as metadata
                from qe.entries_dummy_organism e
                """.trimIndent(),
            )
            st.execute("alter table qe_bench.query_entries add primary key (organism, id)")
            st.execute("analyze qe_bench.query_sequences")
            st.execute("analyze qe_bench.query_entries")
            println("benchmark: tables ready after %.1f s".format((System.nanoTime() - start) / 1e9))
        }
    }

    private fun schema(connection: Connection): QuerySchema {
        val columns = connection.createStatement().use { st ->
            st.executeQuery(
                "select column_name, data_type from information_schema.columns " +
                    "where table_schema = 'qe' and table_name = 'entries_dummy_organism' and column_name <> 'id' " +
                    "and column_name not in " +
                    "('nuc_muts', 'aa_muts', 'nuc_ins', 'aa_ins', 'nuc_missing', 'aa_missing') " +
                    "order by ordinal_position",
            ).use { rs -> buildList { while (rs.next()) add(rs.getString(1) to rs.getString(2)) } }
        }
        val reference = connection.createStatement().use { st ->
            st.executeQuery("select convert_from(dict_contents, 'UTF8') from compression_dictionaries where id = 1")
                .use { rs -> if (rs.next()) rs.getString(1) else "N" }
        }
        return QuerySchema(
            organism = organism,
            instanceName = "bench",
            primaryKey = "accessionVersion",
            metadata = columns.map { (name, type) ->
                MetadataField(
                    name,
                    when (type) {
                        "integer", "bigint" -> FieldType.INT
                        "boolean" -> FieldType.BOOLEAN
                        "double precision", "real", "numeric" -> FieldType.FLOAT
                        else -> FieldType.STRING
                    },
                )
            },
            nucleotideSequences = listOf(SequenceSchema("main", SequenceType.NUCLEOTIDE, 0, reference)),
            genes = emptyList(),
            features = emptySet(),
            lineageDefinitions = emptyMap(),
        )
    }

    private class CountingOutputStream : OutputStream() {
        var count = 0L

        override fun write(b: Int) {
            count++
        }

        override fun write(b: ByteArray, off: Int, len: Int) {
            count += len
        }
    }
}
