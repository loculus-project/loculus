package org.loculus.backend.query.store

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.loculus.backend.config.QueryEngineOrganismConfig
import org.loculus.backend.query.api.FakeIndex
import org.loculus.backend.query.api.LapisInfo
import org.loculus.backend.query.api.LapisQueryExecutor
import org.loculus.backend.query.request.DataFormat
import org.loculus.backend.query.request.Endpoint
import org.loculus.backend.query.request.QueryRequest
import org.loculus.backend.query.schema.FieldType
import org.loculus.backend.query.schema.MetadataField
import org.loculus.backend.query.schema.QuerySchema
import java.io.File
import java.io.OutputStream

/**
 * Manual benchmark of the /details streaming path against a database with a filled (real) query_entries table
 * (read only). Run with e.g.
 *   QUERY_ENGINE_DETAILS_BENCHMARK_DB='jdbc:postgresql://localhost:5433/loculus?user=postgres&password=password' \
 *   QUERY_ENGINE_DETAILS_BENCHMARK_CONFIG=/path/to/backend_config.json \
 *   ./gradlew test --tests 'org.loculus.backend.query.store.DetailsStreamingBenchmark'
 */
@EnabledIfEnvironmentVariable(named = "QUERY_ENGINE_DETAILS_BENCHMARK_DB", matches = ".+")
class DetailsStreamingBenchmark {
    private val organism = System.getenv("QUERY_ENGINE_DETAILS_BENCHMARK_ORGANISM") ?: "dummy-organism"

    @Test
    fun benchmark() {
        val url = System.getenv("QUERY_ENGINE_DETAILS_BENCHMARK_DB")
        val dataSource = HikariDataSource(HikariConfig().apply { jdbcUrl = url })
        val store = PostgresQueryStore(dataSource, mockk(), ExportChunkLimiter.unlimited())
        val ids = dataSource.connection.use { c ->
            c.prepareStatement("select id from query_entries where organism = ? order by id").use { st ->
                st.setString(1, organism)
                st.executeQuery().use { rs -> buildList { while (rs.next()) add(rs.getInt(1)) }.toIntArray() }
            }
        }
        val backendConfig = jacksonObjectMapper().readTree(File(System.getenv("QUERY_ENGINE_DETAILS_BENCHMARK_CONFIG")))
        val config = jacksonObjectMapper().treeToValue(
            backendConfig["organisms"][organism]["queryEngine"],
            QueryEngineOrganismConfig::class.java,
        )
        val schema = QuerySchema(
            organism = organism,
            instanceName = "bench",
            primaryKey = QuerySchema.PRIMARY_KEY,
            metadata = config.metadata.map { MetadataField(it.name, FieldType.fromLoculus(it.type)) },
            nucleotideSequences = emptyList(),
            genes = emptyList(),
            features = emptySet(),
            lineageDefinitions = emptyMap(),
        )
        val index = FakeIndex(schema, emptyMap(), selectResult = ids)
        val executor = LapisQueryExecutor(store)
        val info = { LapisInfo("1", "r", "bench") }
        println("benchmark: ${ids.size} ids")

        repeat(2) { round ->
            measure("[$round] store.streamMetadataJson only", ids.size) {
                var bytes = 0L
                store.streamMetadataJson(organism, ids) { _, json -> bytes += json.length }
                "${bytes / 1_000_000} MB of JSON text"
            }
            measure("[$round] store.streamMetadataFieldChunks, all fields, no rendering", ids.size) {
                var n = 0
                store.streamMetadataFieldChunks(
                    organism,
                    ids,
                    schema.metadata.map { it.name },
                    render = { _, values -> values.size },
                    consumer = { n += it },
                )
                "$n rows"
            }
            for (format in listOf(DataFormat.TSV, DataFormat.CSV, DataFormat.JSON)) {
                measure("[$round] details $format, all fields", ids.size) {
                    val out = CountingOutputStream()
                    executor.execute(organism, index, QueryRequest(Endpoint.DETAILS, dataFormat = format), info)
                        .write(out)
                    "${out.count / 1_000_000} MB written"
                }
            }
            measure("[$round] details TSV, 3 fields", ids.size) {
                val out = CountingOutputStream()
                val request = QueryRequest(
                    Endpoint.DETAILS,
                    fields = listOf("accessionVersion", "country", "date"),
                    dataFormat = DataFormat.TSV,
                )
                executor.execute(organism, index, request, info).write(out)
                "${out.count / 1_000_000} MB written"
            }
        }
        dataSource.close()
    }

    private fun measure(name: String, n: Int, block: () -> String) {
        val start = System.nanoTime()
        val detail = block()
        val seconds = (System.nanoTime() - start) / 1e9
        println("benchmark: %-50s %8.2f s %10.0f rows/s  (%s)".format(name, seconds, n / seconds, detail))
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
