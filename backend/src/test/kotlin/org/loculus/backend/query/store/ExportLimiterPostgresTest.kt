package org.loculus.backend.query.store

import com.github.luben.zstd.Zstd
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.mockk.mockk
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.lessThanOrEqualTo
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import java.lang.reflect.Proxy
import java.sql.Connection
import java.sql.DriverManager
import java.util.Collections
import java.util.concurrent.atomic.AtomicInteger
import javax.sql.DataSource

/**
 * [PostgresQueryStore] under concurrent bulk exports against a real Postgres: the connections its fetch workers hold
 * stay within the [ExportChunkLimiter] cap, and the output does not change. Opt-in, like ProjectionReaderPostgresTest:
 *   QUERY_INDEX_PG_URL=jdbc:postgresql://localhost:5433/loculus?user=postgres&password=password
 */
@EnabledIfEnvironmentVariable(named = "QUERY_INDEX_PG_URL", matches = ".+")
class ExportLimiterPostgresTest {
    private val url = System.getenv("QUERY_INDEX_PG_URL")
    private val dbSchema = "export_limiter_test_${System.nanoTime()}"
    private val pools = mutableListOf<HikariDataSource>()

    @AfterEach
    fun cleanup() {
        pools.forEach { it.close() }
        DriverManager.getConnection(url).use { c ->
            c.createStatement().use { it.execute("drop schema if exists $dbSchema cascade") }
        }
    }

    /** a pooled DataSource that counts the connections borrowed at once */
    private class CountingDataSource(private val delegate: DataSource) : DataSource by delegate {
        val open = AtomicInteger()
        val maxOpen = AtomicInteger()

        override fun getConnection(): Connection {
            val connection = delegate.connection
            maxOpen.accumulateAndGet(open.incrementAndGet()) { a, b -> maxOf(a, b) }
            return Proxy.newProxyInstance(javaClass.classLoader, arrayOf(Connection::class.java)) { _, method, args ->
                if (method.name == "close") open.decrementAndGet()
                try {
                    method.invoke(connection, *(args ?: emptyArray()))
                } catch (e: java.lang.reflect.InvocationTargetException) {
                    throw e.targetException
                }
            } as Connection
        }
    }

    private fun setUp() {
        DriverManager.getConnection(url).use { c ->
            c.createStatement().use { st ->
                st.execute("create schema $dbSchema")
                st.execute(
                    "create table $dbSchema.query_entries (organism text, id int, accession text, version bigint, " +
                        "accession_version text, metadata jsonb, metadata_zstd bytea, metadata_dict_id int, primary key (organism, id))",
                )
                st.execute(
                    "create table $dbSchema.query_sequences (organism text, kind smallint, sequence_index int, " +
                        "id int, compression_dict_id int, data bytea, primary key (organism, kind, sequence_index, id))",
                )
                // ~1 kB records: metadata chunks of ~1000 rows, so an export of all rows has ~20 chunks
                st.execute(
                    "insert into $dbSchema.query_entries select 'test', i, 'A' || i, 1, 'A' || i || '.1', " +
                        "jsonb_build_object('accessionVersion', 'A' || i || '.1', 'n', i) || " +
                        "(select jsonb_object_agg('field' || f, md5(i::text || f) || md5(f::text || i)) " +
                        "from generate_series(1, 14) f) from generate_series(0, $ROWS - 1) i",
                )
            }
            c.prepareStatement("insert into $dbSchema.query_sequences values ('test', 1, 0, ?, null, ?)").use { ps ->
                for (id in 0 until ROWS) {
                    ps.setInt(1, id)
                    ps.setBytes(2, Zstd.compress("ACGT".repeat(10 + id % 7).toByteArray()))
                    ps.addBatch()
                }
                ps.executeBatch()
            }
        }
    }

    private fun store(cap: Int): Pair<PostgresQueryStore, CountingDataSource> {
        val pool = HikariDataSource(
            HikariConfig().apply {
                jdbcUrl = "$url&currentSchema=$dbSchema"
                maximumPoolSize = 40
            },
        ).also { pools.add(it) }
        val counting = CountingDataSource(pool)
        return PostgresQueryStore(counting, mockk(), ExportChunkLimiter(cap)) to counting
    }

    private val fields = listOf("accessionVersion", "n", "field1", "field9")
    private val allIds = IntArray(ROWS) { (it * 7919) % ROWS } // a permutation: no range scans

    private fun metadataExport(store: PostgresQueryStore): String {
        val out = StringBuilder()
        store.streamMetadataFieldChunks(
            "test",
            allIds,
            fields,
            render = { ids, values ->
                ids.indices.joinToString("") { "${ids[it]}\t${values[it].joinToString("\t")}\n" }
            },
            consumer = { out.append(it) },
        )
        return out.toString()
    }

    private fun sequenceExport(store: PostgresQueryStore): String {
        val out = StringBuilder()
        store.streamSequenceRows(
            "test",
            SequenceKind.ALIGNED_NUCLEOTIDE,
            listOf(0),
            allIds,
            listOf("accessionVersion"),
            object : SequenceRowConsumer {
                override fun row(id: Int, values: Array<String?>) {
                    out.append('>').append(values[0]).append('\n')
                }

                override fun sequence(id: Int, sequenceIndex: Int, sequence: ByteArray, length: Int) {
                    out.append(String(sequence, 0, length)).append('\n')
                }
            },
        )
        return out.toString()
    }

    /** 12 exports at once, a third of them sequences; (kind, output) of each */
    private fun concurrentExports(store: PostgresQueryStore): List<Pair<String, String>> {
        val results = Collections.synchronizedList(ArrayList<Pair<String, String>>())
        val errors = Collections.synchronizedList(ArrayList<Throwable>())
        val threads = (0 until 12).map { i ->
            Thread.ofVirtual().start {
                try {
                    results.add(
                        if (i % 3 == 0) "sequences" to sequenceExport(store) else "metadata" to metadataExport(store),
                    )
                } catch (e: Throwable) {
                    errors.add(e)
                }
            }
        }
        threads.forEach { it.join() }
        assertThat(errors, equalTo(emptyList()))
        assertThat(results.size, equalTo(12))
        return results
    }

    @Test
    fun `concurrent exports hold at most the cap of connections and produce the same bytes`() {
        setUp()
        val cap = 3

        // without a cap, the same exports hold many more connections (the control for the assertion below)
        val (reference, uncapped) = store(ExportChunkLimiter.unlimited().maxPermits)
        val expectedMetadata = metadataExport(reference)
        val expectedSequences = sequenceExport(reference)
        assertThat(expectedMetadata.lines().size, equalTo(ROWS + 1))
        uncapped.maxOpen.set(0)
        concurrentExports(reference)
        assertThat(uncapped.maxOpen.get(), greaterThan(cap))

        val (store, counting) = store(cap)
        metadataExport(store) // caches the record size, read on the calling thread once per organism
        counting.maxOpen.set(0)
        concurrentExports(store).forEach { (kind, bytes) ->
            assertThat(kind, bytes, equalTo(if (kind == "sequences") expectedSequences else expectedMetadata))
        }
        assertThat(counting.maxOpen.get(), lessThanOrEqualTo(cap))
        assertThat(counting.open.get(), equalTo(0))
    }

    private companion object {
        const val ROWS = 20_000
    }
}
