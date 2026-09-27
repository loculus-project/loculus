package org.loculus.backend.query.index

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.loculus.backend.query.filter.And
import org.loculus.backend.query.filter.DateBetween
import org.loculus.backend.query.filter.Filter
import org.loculus.backend.query.filter.HasMutation
import org.loculus.backend.query.filter.LineageIn
import org.loculus.backend.query.filter.Maybe
import org.loculus.backend.query.filter.NOf
import org.loculus.backend.query.filter.Not
import org.loculus.backend.query.filter.StringEquals
import org.loculus.backend.query.filter.StringRegex
import org.loculus.backend.query.filter.SymbolEquals
import org.loculus.backend.query.filter.True
import org.loculus.backend.query.request.OrderByField
import org.loculus.backend.query.request.OrderDirection
import org.loculus.backend.query.schema.Alphabet
import org.loculus.backend.query.schema.FieldType
import org.loculus.backend.query.schema.MetadataField
import org.loculus.backend.query.schema.MutationCode
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.schema.SequenceType
import java.io.File
import java.sql.DriverManager
import java.time.LocalDate
import kotlin.random.Random

/**
 * Latency benchmarks at SARS-CoV-2 scale. Disabled by default:
 *
 *   QUERY_INDEX_BENCHMARK=1 TEST_MAX_HEAP=12g ./gradlew test --tests '*IndexBenchmarks*'
 *
 * `realData` reads the prototype projection qe.entries_dummy_organism (965k SARS-CoV-2 sequences) from the
 * local Postgres at localhost:5433 (and needs SC2_BACKEND_CONFIG pointing to a backend_config.json with the
 * dummy-organism reference); `synthetic` generates 1M entries.
 */
@EnabledIfEnvironmentVariable(named = "QUERY_INDEX_BENCHMARK", matches = "1")
class IndexBenchmarks {
    private val nuc = Alphabet.NUCLEOTIDE
    private val aa = Alphabet.AMINO_ACID

    /** reference genome of the dummy organism from a Loculus backend_config.json (env SC2_BACKEND_CONFIG) */
    private fun sc2Schema(metadata: List<MetadataField>): QuerySchema {
        val path = System.getenv("SC2_BACKEND_CONFIG") ?: error("set SC2_BACKEND_CONFIG to a backend_config.json")
        val config = ObjectMapper().readTree(File(path))
        val ref = config["organisms"]["dummy-organism"]["referenceGenome"]
        return IndexTestSupport.schema(
            metadata = metadata,
            nucleotide = ref["nucleotideSequences"].associate { it["name"].asText() to it["sequence"].asText() },
            genes = ref["genes"].associate { it["name"].asText() to it["sequence"].asText() },
        )
    }

    private val realMetadata = listOf(
        MetadataField("accessionVersion", FieldType.STRING),
        MetadataField("accession", FieldType.STRING),
        MetadataField("version", FieldType.INT),
        MetadataField("submissionId", FieldType.STRING),
        MetadataField("submitter", FieldType.STRING),
        MetadataField("groupId", FieldType.INT),
        MetadataField("groupName", FieldType.STRING),
        MetadataField("submittedAtTimestamp", FieldType.INT),
        MetadataField("submittedDate", FieldType.STRING),
        MetadataField("releasedAtTimestamp", FieldType.INT),
        MetadataField("releasedDate", FieldType.STRING),
        MetadataField("isRevocation", FieldType.BOOLEAN),
        MetadataField("versionStatus", FieldType.STRING),
        MetadataField("pipelineVersion", FieldType.INT),
        MetadataField("dataUseTerms", FieldType.STRING),
        MetadataField("country", FieldType.STRING),
        MetadataField("date", FieldType.DATE),
        MetadataField("division", FieldType.STRING),
        MetadataField("host", FieldType.STRING),
        MetadataField("pangoLineage", FieldType.STRING, lineageSystem = "pango"),
        MetadataField("region", FieldType.STRING),
    )

    @Test
    fun realData() {
        val schema = sc2Schema(realMetadata)
        val genes = schema.genes
        // prototype layout: aa positions are global, gene offsets = cumulative (length + 1)
        val geneOffsets = IntArray(genes.size)
        for (i in 1 until genes.size) geneOffsets[i] = geneOffsets[i - 1] + genes[i - 1].length + 1
        fun aaGene(global: Int): Int {
            var g = genes.size - 1
            while (g > 0 && geneOffsets[g] >= global) g--
            return g
        }
        val seqIndexByName = schema.allSequences().associate { it.name to it.index }
        val columns = realMetadata.joinToString(", ") { "\"${it.name}\"" }
        val started = System.nanoTime()
        val beforeHeap = usedHeap()
        val index = InMemoryOrganismIndex(schema, 1_000_000)
        val sampleRows = mutableListOf<IndexRow>()
        DriverManager.getConnection("jdbc:postgresql://localhost:5433/loculus", "postgres", "password").use { c ->
            c.autoCommit = false
            c.prepareStatement(
                "select id, $columns, array_send(nuc_muts), nuc_missing::text, array_send(aa_muts), " +
                    "aa_missing::text, array_send(nuc_ins), array_send(aa_ins) from qe.entries_dummy_organism order by id",
            ).use { st ->
                st.fetchSize = 5000
                st.executeQuery().use { rs ->
                    val m = realMetadata.size
                    while (rs.next()) {
                        val id = rs.getInt(1)
                        val values = arrayOfNulls<Any?>(m)
                        for (i in 0 until m) {
                            values[i] =
                                rs.getObject(i + 2)?.let { if (it is java.sql.Date) it.toString() else it }
                        }
                        val nucMuts = PgBinaryArrays.intArray(rs.getBytes(m + 2))
                        val nucMissing = parseMultirange(rs.getString(m + 3))
                        val aaMuts = PgBinaryArrays.intArray(rs.getBytes(m + 4))
                        val aaMissing = parseMultirange(rs.getString(m + 5))
                        val insertions = (
                            PgBinaryArrays.textArray(rs.getBytes(m + 6)) + PgBinaryArrays.textArray(rs.getBytes(m + 7))
                            ).mapNotNull { ins ->
                            val name = ins.substringBefore(':')
                            seqIndexByName[name]?.let { "$it:${ins.substringAfter(':')}" }
                        }
                        val mutations = IntArray(nucMuts.size + aaMuts.size)
                        for (i in nucMuts.indices) {
                            mutations[i] =
                                MutationCode.encode(0, nucMuts[i] / 32, nucMuts[i] % 32)
                        }
                        for (i in aaMuts.indices) {
                            val global = aaMuts[i] / 32
                            val g = aaGene(global)
                            mutations[nucMuts.size + i] =
                                MutationCode.encode(1 + g, global - geneOffsets[g], aaMuts[i] % 32)
                        }
                        val missing = ArrayList<Int>()
                        for (r in nucMissing.indices step 2) missing += listOf(0, nucMissing[r], nucMissing[r + 1])
                        for (r in aaMissing.indices step 2) {
                            val g = aaGene(aaMissing[r])
                            missing += listOf(1 + g, aaMissing[r] - geneOffsets[g], aaMissing[r + 1] - geneOffsets[g])
                        }
                        val hasNuc = nucMuts.isNotEmpty() || nucMissing.isNotEmpty()
                        val present = if (hasNuc) IntArray(1 + genes.size) { it } else IntArray(0)
                        val row = IndexRow(id, values, present, mutations, missing.toIntArray(), insertions)
                        if (id % 9973 == 0) sampleRows.add(row)
                        index.addForBulkLoad(row)
                    }
                }
            }
        }
        index.finishBulkLoad(0)
        val loadMs = (System.nanoTime() - started) / 1_000_000
        val heap = usedHeap() - beforeHeap
        println("REAL DATA: loaded ${index.size} entries in $loadMs ms, heap delta ${heap / 1_000_000} MB")
        printMemory(index)
        runQueries(index, schema, sampleRows)
    }

    @Test
    fun synthetic() {
        val refRandom = Random(0)
        val schema = IndexTestSupport.schema(
            nucleotide = mapOf("main" to (1..29903).map { "ACGT"[refRandom.nextInt(4)] }.joinToString("")),
            genes = mapOf(
                "S" to (1..1273).map {
                    "ACDEFGHIKLMNPQRSTVWY"[refRandom.nextInt(20)]
                }.joinToString("") + "*",
            ),
            metadata = listOf(
                MetadataField("accessionVersion", FieldType.STRING),
                MetadataField("country", FieldType.STRING),
                MetadataField("date", FieldType.DATE),
                MetadataField("pangoLineage", FieldType.STRING, lineageSystem = "pango"),
                MetadataField("age", FieldType.INT),
            ),
        )
        val random = Random(1)
        val main = schema.nucleotideSequences[0]
        val lineages = (0 until 2000).map { "L.$it" }
        // lineage-defining mutations: each lineage has ~100 of 3000 "common" mutation codes
        val common = IntArray(3000) {
            val p = random.nextInt(1, main.length + 1)
            var s = random.nextInt(1, 5)
            if (s == main.referenceSymbolIndex(p)) s = (s % 4) + 1
            MutationCode.encode(0, p, s)
        }
        val lineageCodes = lineages.indices.map { l ->
            val r = Random(l)
            IntArray(100) { common[(l * 7 + r.nextInt(300)) % common.size] }.distinct().sorted().toIntArray()
        }
        val started = System.nanoTime()
        val beforeHeap = usedHeap()
        val index = InMemoryOrganismIndex(schema, 1_000_000)
        val baseDay = LocalDate.parse("2020-01-01").toEpochDay().toInt()
        val sampleRows = mutableListOf<IndexRow>()
        for (id in 0 until 1_000_000) {
            val l = minOf(lineages.size - 1, (random.nextDouble() * random.nextDouble() * lineages.size).toInt())
            val codes = ArrayList<Int>(130)
            lineageCodes[l].forEach { codes.add(it) }
            repeat(27) {
                val p = random.nextInt(1, main.length + 1)
                codes.add(MutationCode.encode(0, p, if (random.nextInt(10) == 0) 0 else random.nextInt(1, 16)))
            }
            val missing = mutableListOf(
                0,
                1,
                random.nextInt(2, 80),
                0,
                main.length - random.nextInt(0, 100),
                main.length + 1,
            )
            repeat(random.nextInt(0, 7)) {
                val s = random.nextInt(100, main.length - 400)
                if (s > missing[missing.size - 5]) missing += listOf(0, s, s + random.nextInt(1, 300))
            }
            val values = arrayOf<Any?>(
                "ID_$id.1",
                "C${minOf(199, (random.nextDouble() * random.nextDouble() * 200).toInt())}",
                baseDay + random.nextInt(1500),
                lineages[l],
                random.nextInt(100),
            )
            val sortedMissing = missing.chunked(3).sortedBy { it[1] }.flatten()
            val row =
                IndexRow(
                    id,
                    values,
                    intArrayOf(0),
                    codes.distinct().toIntArray(),
                    sortedMissing.toIntArray(),
                    emptyList(),
                )
            if (id % 9973 == 0) sampleRows.add(row)
            index.addForBulkLoad(row)
        }
        index.finishBulkLoad(0)
        println(
            "SYNTHETIC: built ${index.size} entries in ${(System.nanoTime() - started) / 1_000_000} ms, " +
                "heap delta ${(usedHeap() - beforeHeap) / 1_000_000} MB",
        )
        printMemory(index)
        runQueries(index, schema, sampleRows)
    }

    private fun runQueries(index: InMemoryOrganismIndex, schema: QuerySchema, sampleRows: List<IndexRow>) {
        val all = index.evaluate(True)
        val topCountry = index.aggregate(all, listOf("country")).maxBy { it.count }.values[0] as String
        val lineageCounts = index.aggregate(all, listOf("pangoLineage")).sortedByDescending { it.count }
        val midLineage = lineageCounts[lineageCounts.size / 20].values[0] as String
        val manyLineages = lineageCounts.take(200).mapNotNull { it.values[0] as String? }.toSet()
        val topMutations = index.mutations(all, SequenceType.NUCLEOTIDE, 0.01).sortedByDescending { it.count }
        val frequent = topMutations.first()
        val mediumMut = topMutations.last()
        println(
            "  top country $topCountry, lineage $midLineage, frequent ${frequent.symbolTo}${frequent.position} (${frequent.count})",
        )
        val d614g = SymbolEquals(0, frequent.position, nuc.indexOf(frequent.symbolTo))
        val rare = SymbolEquals(0, mediumMut.position, nuc.indexOf(mediumMut.symbolTo))
        val countryFilter = StringEquals("country", topCountry)
        val lineageFilter = LineageIn("pangoLineage", setOf(midLineage))
        val d = LocalDate.parse("2021-06-01").toEpochDay().toInt()
        val filters: List<Pair<String, Filter>> = listOf(
            "true" to True,
            "country=top" to countryFilter,
            "lineage=mid" to lineageFilter,
            "lineage in 200" to LineageIn("pangoLineage", manyLineages),
            "date range" to DateBetween("date", d, d + 60),
            "frequent mutation" to d614g,
            "rare mutation" to rare,
            "hasMutation(frequent pos)" to HasMutation(0, frequent.position),
            "maybe(frequent)" to Maybe(d614g),
            "21N (missing point)" to SymbolEquals(0, 21, nuc.missingIndex),
            "15000N (missing point)" to SymbolEquals(0, 15000, nuc.missingIndex),
            "ref at 21" to SymbolEquals(0, 21, schema.nucleotideSequences[0].referenceSymbolIndex(21)),
            "country & mutation & !rare" to And(listOf(countryFilter, d614g, Not(rare))),
            "3-of-5 mutations" to
                NOf(3, false, topMutations.take(5).map { SymbolEquals(0, it.position, nuc.indexOf(it.symbolTo)) }),
            "regex accessionVersion" to StringRegex("accessionVersion", "5.\\.1$"),
            "S:501Y (aa)" to SymbolEquals(schema.gene("S")!!.index, 501, aa.indexOf('Y')),
        )
        for ((name, filter) in filters) {
            val n = index.evaluate(filter).cardinality
            bench("evaluate $name [$n]") { index.evaluate(filter) }
        }
        val countryIds = index.evaluate(countryFilter)
        val lineageIds = index.evaluate(lineageFilter)
        val halfIds = index.evaluate(DateBetween("date", Int.MIN_VALUE + 1, d))
        bench("aggregate count all") { index.aggregate(all, emptyList()) }
        bench("aggregate country all") { index.aggregate(all, listOf("country")) }
        bench("aggregate pangoLineage all") { index.aggregate(all, listOf("pangoLineage")) }
        bench("aggregate country,date all") { index.aggregate(all, listOf("country", "date")) }
        bench("aggregate date country=top [${countryIds.cardinality}]") { index.aggregate(countryIds, listOf("date")) }
        bench("aggregate [21] all") { index.aggregate(all, listOf("[21]")) }
        val recording = System.getenv("QUERY_INDEX_JFR")?.takeIf {
            System.getenv("QUERY_INDEX_JFR_UPDATES") == null
        }?.let { path ->
            jdk.jfr.Recording(jdk.jfr.Configuration.getConfiguration("profile")).apply {
                setDestination(java.nio.file.Path.of(path))
                start()
            }
        }
        for ((label, ids) in listOf(
            "all" to all,
            "country=top [${countryIds.cardinality}]" to countryIds,
            "date<=2021-06 [${halfIds.cardinality}]" to halfIds,
            "lineage=mid [${lineageIds.cardinality}]" to lineageIds,
        )) {
            for (mp in listOf(0.05, 0.0)) {
                val rows = index.mutations(ids, SequenceType.NUCLEOTIDE, mp).size
                bench("nuc mutations $label mp=$mp [$rows rows]", iterations = 5) {
                    index.mutations(ids, SequenceType.NUCLEOTIDE, mp)
                }
            }
            val aaRows = index.mutations(ids, SequenceType.AMINO_ACID, 0.05).size
            bench("aa mutations $label mp=0.05 [$aaRows rows]", iterations = 5) {
                index.mutations(ids, SequenceType.AMINO_ACID, 0.05)
            }
        }
        bench("nuc mutations lineage=mid mp=0.05 single thread", iterations = 5) {
            InMemoryOrganismIndex.parallelMutations = false
            index.mutations(lineageIds, SequenceType.NUCLEOTIDE, 0.05).also {
                InMemoryOrganismIndex.parallelMutations =
                    true
            }
        }
        bench("nuc mutations country=top mp=0.05 single thread", iterations = 5) {
            InMemoryOrganismIndex.parallelMutations = false
            index.mutations(countryIds, SequenceType.NUCLEOTIDE, 0.05).also {
                InMemoryOrganismIndex.parallelMutations =
                    true
            }
        }
        bench("insertions nuc all") { index.insertions(all, SequenceType.NUCLEOTIDE) }
        bench("insertions nuc country=top") { index.insertions(countryIds, SequenceType.NUCLEOTIDE) }
        val byDate = listOf(OrderByField("date", OrderDirection.DESCENDING))
        bench("select no order limit 100") { index.select(all, emptyList(), null, 0, 100) }
        bench("select order by date desc limit 100") { index.select(all, byDate, null, 0, 100) }
        bench("select order by accessionVersion limit 100 offset 1000") {
            index.select(all, listOf(OrderByField("accessionVersion", OrderDirection.ASCENDING)), null, 1000, 100)
        }
        bench("select order by date country=top full", iterations = 3) {
            index.select(countryIds, byDate, null, 0, null)
        }
        bench("select order by date all full", iterations = 3) { index.select(all, byDate, null, 0, null) }
        bench("select random limit 10") {
            index.select(all, emptyList(), org.loculus.backend.query.request.RandomOrder(1), 0, 10)
        }
        recording?.stop()
        recording?.close()
        val updateRecording = System.getenv("QUERY_INDEX_JFR")?.takeIf {
            System.getenv("QUERY_INDEX_JFR_UPDATES") !=
                null
        }?.let { path ->
            jdk.jfr.Recording(jdk.jfr.Configuration.getConfiguration("profile")).apply {
                setDestination(java.nio.file.Path.of(path))
                start()
            }
        }
        // incremental update: re-apply ~100 existing entries with their full sequence data
        bench("apply ${sampleRows.size} upserts (with sequences)", iterations = 5) {
            index.apply(sampleRows, emptyList())
        }
        println("    last apply: ${index.apply(sampleRows, emptyList())}")
        println("    apply 1 row: ${index.apply(sampleRows.take(1), emptyList())}")
        bench("mutations all right after an update", iterations = 5) {
            index.apply(sampleRows.take(1), emptyList())
            index.mutations(all, SequenceType.NUCLEOTIDE, 0.05)
        }
        updateRecording?.stop()
        updateRecording?.close()
    }

    private fun bench(name: String, iterations: Int = 20, block: () -> Any) {
        repeat(3) { block() }
        val times = (0 until iterations).map {
            val t = System.nanoTime()
            block()
            (System.nanoTime() - t) / 1e6
        }.sorted()
        println("  %-70s median %8.2f ms   min %8.2f ms".format(name, times[times.size / 2], times[0]))
    }

    private fun usedHeap(): Long {
        repeat(3) { System.gc() }
        val rt = Runtime.getRuntime()
        return rt.totalMemory() - rt.freeMemory()
    }

    private fun printMemory(index: InMemoryOrganismIndex) {
        val usage = index.memoryUsage()
        println("  estimated index memory ${usage.values.sum() / 1_000_000} MB")
        index.structureStats().entries.take(4).forEach { (name, stats) ->
            println(
                "    $name: ${stats[0]} mutation bitmaps, ${stats[1]} containers, ${stats[2]} run transition bitmaps",
            )
        }
        usage.entries.sortedByDescending {
            it.value
        }.take(12).forEach { (k, v) -> println("    $k: ${v / 1_000_000} MB") }
    }

    private fun parseMultirange(text: String?): IntArray {
        if (text == null || text == "{}") return IntArray(0)
        val numbers = Regex("\\d+").findAll(text).map { it.value.toInt() }.toList()
        return numbers.toIntArray()
    }
}
