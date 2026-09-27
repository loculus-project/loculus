package org.loculus.backend.query.index

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.loculus.backend.config.ReferenceGenome
import org.loculus.backend.config.ReferenceSequence
import org.loculus.backend.query.filter.And
import org.loculus.backend.query.filter.DateBetween
import org.loculus.backend.query.filter.Filter
import org.loculus.backend.query.filter.LineageIn
import org.loculus.backend.query.filter.StringEquals
import org.loculus.backend.query.filter.SymbolEquals
import org.loculus.backend.query.filter.True
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.schema.SequenceType
import org.loculus.backend.query.schema.SiloConfigReader
import org.roaringbitmap.RoaringBitmap
import java.io.File
import java.sql.DriverManager
import java.time.LocalDate

/**
 * Benchmarks against the real projection tables (query_entries / query_mutation_data) using the production
 * loading path. Opt-in:
 *
 *   QUERY_INDEX_BENCHMARK=1 TEST_MAX_HEAP=16g QUERY_INDEX_PG_URL='jdbc:postgresql://localhost:5433/loculus?user=postgres&password=password' \
 *   QUERY_CONFIG_DIR=/path/to/query-config SC2_BACKEND_CONFIG=/path/to/backend_config.json \
 *   ./gradlew test --tests '*ProjectionBenchmark*'
 */
@EnabledIfEnvironmentVariable(named = "QUERY_INDEX_BENCHMARK", matches = "1")
class ProjectionBenchmark {
    private val organism = "dummy-organism"
    private val url =
        System.getenv("QUERY_INDEX_PG_URL")
            ?: "jdbc:postgresql://localhost:5433/loculus?user=postgres&password=password"

    private fun schema(): QuerySchema {
        val config = ObjectMapper().readTree(File(System.getenv("SC2_BACKEND_CONFIG")))
        val ref = config["organisms"][organism]["referenceGenome"]
        val genome = ReferenceGenome(
            ref["nucleotideSequences"].map { ReferenceSequence(it["name"].asText(), it["sequence"].asText()) },
            ref["genes"].map { ReferenceSequence(it["name"].asText(), it["sequence"].asText()) },
        )
        val dbConfig = SiloConfigReader.readDatabaseConfig(
            File(System.getenv("QUERY_CONFIG_DIR"), "$organism/database_config.yaml"),
        )
        return QuerySchema.build(organism, dbConfig, genome, emptyMap())
    }

    @Test
    fun projection() {
        val schema = schema()
        val reader = ProjectionReader(schema)
        val started = System.nanoTime()
        val maxId = DriverManager.getConnection(url).use { c ->
            c.createStatement().use { st ->
                st.executeQuery("select max(id) from query_entries where organism = '$organism'").use { rs ->
                    rs.next()
                    rs.getInt(1)
                }
            }
        }
        val index = IndexLoader.load(
            schema,
            maxId,
            readRange = { from, to, consumer ->
                DriverManager.getConnection(url).use { c ->
                    c.autoCommit = false
                    reader.streamRange(c, from, to, consumer = consumer)
                    c.rollback()
                }
            },
            dataVersion = 0,
            readers = System.getenv("QUERY_INDEX_LOAD_READERS")?.toInt() ?: 8,
        )
        println("PROJECTION: loaded ${index.size} entries in ${(System.nanoTime() - started) / 1_000_000} ms")
        println("  estimated index memory ${index.memoryUsage().values.sum() / 1_000_000} MB")
        val loaderConnection = DriverManager.getConnection(url)
        index.rowLoader = { ids -> synchronized(loaderConnection) { reader.readIds(loaderConnection, ids) } }

        val all = index.evaluate(True)
        val oneId = index.evaluate(StringEquals("accessionVersion", index.value(123_456, "accessionVersion") as String))
        val swiss = index.evaluate(StringEquals("country", "Switzerland"))
        val usa = index.evaluate(StringEquals("country", "USA"))
        val lineageCounts = index.aggregate(all, listOf("pangoLineage")).sortedByDescending { it.count }
        val lineage = index.evaluate(LineageIn("pangoLineage", setOf(lineageCounts[3].values[0] as String)))
        val small = RoaringBitmap.bitmapOf(
            *index.select(all, emptyList(), org.loculus.backend.query.request.RandomOrder(3), 0, 200),
        )
        val s = schema.gene("S")!!
        val d = LocalDate.parse("2021-06-01").toEpochDay().toInt()
        val cases = mutableListOf<Pair<String, () -> Any>>()
        for ((label, ids) in listOf(
            "1 id" to oneId,
            "200 ids" to small,
            "Switzerland" to swiss,
            "USA" to usa,
            "lineage#4" to lineage,
            "all" to all,
            "all-1" to all.clone().also { it.remove(123_456) },
            "all-1000" to all.clone().also { bm -> (0 until 1000).forEach { bm.remove(it * 911) } },
        )) {
            val n = ids.cardinality
            cases += "nuc mutations $label [$n] mp=0.05" to { index.mutations(ids, SequenceType.NUCLEOTIDE, 0.05) }
            cases += "aa mutations $label [$n] mp=0.05" to { index.mutations(ids, SequenceType.AMINO_ACID, 0.05) }
            cases += "nuc mutations $label [$n] mp=0" to { index.mutations(ids, SequenceType.NUCLEOTIDE, 0.0) }
            cases += "nuc insertions $label [$n]" to { index.insertions(ids, SequenceType.NUCLEOTIDE) }
        }
        val filters: List<Pair<String, Filter>> = listOf(
            "S:501N (ref)" to SymbolEquals(s.index, 501, s.alphabet.indexOf('N')),
            "S:501Y" to SymbolEquals(s.index, 501, s.alphabet.indexOf('Y')),
            "S:501X (missing)" to SymbolEquals(s.index, 501, s.alphabet.missingIndex),
            "main:21C (ref)" to SymbolEquals(0, 21, 2),
            "date range 2 months" to DateBetween("date", d, d + 60),
            "date <= 2021-06" to DateBetween("date", null, d),
            "date >= 2020-01-01" to DateBetween("date", LocalDate.parse("2020-01-01").toEpochDay().toInt(), null),
            "country=USA & date<=2021-06" to And(listOf(StringEquals("country", "USA"), DateBetween("date", null, d))),
        )
        for ((name, f) in filters) cases += "evaluate $name [${index.evaluate(f).cardinality}]" to { index.evaluate(f) }
        cases += "aggregate country all" to { index.aggregate(all, listOf("country")) }
        cases += "aggregate country,pangoLineage all" to { index.aggregate(all, listOf("country", "pangoLineage")) }
        cases += "aggregate date all" to { index.aggregate(all, listOf("date")) }
        cases += "aggregate country,date USA" to { index.aggregate(usa, listOf("country", "date")) }
        diagnose(index, swiss)
        for (size in listOf(20, 50, 100, 200)) {
            val ids = RoaringBitmap.bitmapOf(
                *index.select(all, emptyList(), org.loculus.backend.query.request.RandomOrder(9), 0, size),
            )
            val loader = index.rowLoader
            cases += "small set $size: rows" to { index.mutations(ids, SequenceType.NUCLEOTIDE, 0.05) }
            cases += "small set $size: bitmaps" to {
                index.rowLoader = null
                try {
                    index.mutations(ids, SequenceType.NUCLEOTIDE, 0.05)
                } finally {
                    index.rowLoader = loader
                }
            }
            cases += "small set $size aa: bitmaps" to {
                index.rowLoader = null
                try {
                    index.mutations(ids, SequenceType.AMINO_ACID, 0.05)
                } finally {
                    index.rowLoader = loader
                }
            }
        }
        val main = index.sequenceIndex(0)
        val swissMain = RoaringBitmap.and(swiss, main.present)
        cases += "missing counts over Switzerland (main)" to { main.missingCountsOver(swissMain) }
        cases += "missing counts over all (main)" to { main.runs.countsOver(null) }
        cases += "missingAt(15000) (main)" to { main.missingAt(15000) }
        for ((name, block) in cases) bench(name, block)
        val updateRows = reader.readIds(loaderConnection, (0 until 96).map { it * 10_007 })
        bench("apply ${updateRows.size} upserts (real rows)") { index.apply(updateRows, emptyList()) }
        println("    last: ${index.apply(updateRows, emptyList())}")
        println("    1 row: ${index.apply(updateRows.take(1), emptyList())}")
        loaderConnection.close()
    }

    /** container pairs visited when counting mutations of `main` over [ids] */
    private fun diagnose(index: InMemoryOrganismIndex, ids: RoaringBitmap) {
        val seq = index.sequenceIndex(0)
        val filter = forIntersections(RoaringBitmap.and(ids, seq.present))
        val filterContainers = HashMap<Char, org.roaringbitmap.Container>()
        val fp = filter.containerPointer
        while (fp.container != null) {
            filterContainers[fp.key()] = fp.container
            fp.advance()
        }
        val pairs = HashMap<String, LongArray>()
        val t = System.nanoTime()
        for (perSymbol in seq.mutations) {
            perSymbol?.forEach { bm ->
                if (bm == null) return@forEach
                val p = bm.containerPointer
                while (p.container != null) {
                    val f = filterContainers[p.key()]
                    if (f != null) {
                        val c = p.container
                        val key = "${f.javaClass.simpleName}x${c.javaClass.simpleName}"
                        val entry = pairs.getOrPut(key) { LongArray(3) }
                        val t0 = System.nanoTime()
                        f.andCardinality(c)
                        entry[2] += System.nanoTime() - t0
                        entry[0]++
                        entry[1] += c.cardinality.toLong()
                    }
                    p.advance()
                }
            }
        }
        println("  diagnose main x ${filter.cardinality}: ${(System.nanoTime() - t) / 1_000_000} ms sequential")
        val t1 = System.nanoTime()
        repeat(5) { seq.missingCountsOver(filter) }
        println(
            "    missing counts over filter: ${(System.nanoTime() - t1) / 5_000_000.0} ms (${seq.runs.runCount} runs)",
        )
        val t2 = System.nanoTime()
        repeat(5) { seq.missingAt(15000) }
        println("    missingAt: ${(System.nanoTime() - t2) / 5_000_000.0} ms")
        val n = filter.cardinality
        var survivors = 0
        var survivorContainers = 0L
        for (p in 1..seq.length) {
            val perSymbol = seq.mutations[p] ?: continue
            for (s in perSymbol.indices) {
                val bm = perSymbol[s] ?: continue
                if (minOf(n, seq.mutationCounts[p * perSymbol.size + s]) > (n * 0.05).toInt() - 1) {
                    survivors++
                    val cp = bm.containerPointer
                    while (cp.container != null) {
                        survivorContainers++
                        cp.advance()
                    }
                }
            }
        }
        println("    bitmaps with total count above ~threshold: $survivors ($survivorContainers containers)")
        pairs.forEach { (k, v) ->
            println("    $k: ${v[0]} pairs, ${v[1]} mutation-side values, ${v[2] / 1_000_000} ms")
        }
    }

    private fun bench(name: String, block: () -> Any) {
        repeat(3) { block() }
        val profile = System.getenv("QUERY_INDEX_JFR_CASE")?.takeIf { name.contains(it) }?.let {
            jdk.jfr.Recording(jdk.jfr.Configuration.getConfiguration("profile")).apply {
                setDestination(java.nio.file.Path.of(System.getenv("QUERY_INDEX_JFR")))
                start()
            }
        }
        if (profile != null) repeat(200) { block() }
        profile?.stop()
        profile?.close()
        val times = (0 until 15).map {
            val t = System.nanoTime()
            block()
            (System.nanoTime() - t) / 1e6
        }.sorted()
        println("  %-60s median %8.2f ms   min %8.2f ms".format(name, times[times.size / 2], times[0]))
    }
}
