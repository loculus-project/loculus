package org.loculus.backend.query.index

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.roaringbitmap.RoaringBitmap
import kotlin.random.Random

class RunTableTest {
    private val random = Random(3)

    /** id -> runs (start, end exclusive), disjoint and sorted */
    private fun randomRuns(length: Int, ids: List<Int>, withRuns: Double): Map<Int, List<Pair<Int, Int>>> =
        ids.filter { random.nextDouble() < withRuns }.associateWith {
            val runs = ArrayList<Pair<Int, Int>>()
            var p = 1
            repeat(random.nextInt(1, 5)) {
                val start = p + random.nextInt(0, maxOf(1, length / 4))
                val end = minOf(length + 1, start + random.nextInt(1, maxOf(2, length / 8)))
                if (start < end && start <= length) runs.add(start to end)
                p = end + 1
                if (p > length) return@associateWith runs
            }
            runs
        }

    private fun bruteCounts(length: Int, runs: Map<Int, List<Pair<Int, Int>>>, filter: RoaringBitmap?): IntArray {
        val counts = IntArray(length + 1)
        for ((id, list) in runs) {
            if (filter != null && !filter.contains(id)) continue
            for ((s, e) in list) for (p in s until e) counts[p]++
        }
        return counts
    }

    private fun check(table: RunTable, length: Int, runs: Map<Int, List<Pair<Int, Int>>>, ids: List<Int>) {
        val filters = listOf(
            null,
            RoaringBitmap.bitmapOf(*ids.toIntArray()),
            RoaringBitmap.bitmapOf(*ids.filter { random.nextDouble() < 0.3 }.toIntArray()),
            RoaringBitmap.bitmapOf(*ids.filter { random.nextDouble() < 0.02 }.toIntArray()),
            RoaringBitmap.bitmapOf(),
        )
        for (f in filters) {
            assertThat(table.countsOver(f).toList(), equalTo(bruteCounts(length, runs, f).toList()))
        }
        for (p in listOf(1, length, random.nextInt(1, length + 1), random.nextInt(1, length + 1))) {
            val expected = runs.filter { (_, list) -> list.any { (s, e) -> p in s until e } }.keys.sorted()
            assertThat("missingAt $p", table.missingAt(p).toArray().toList(), equalTo(expected))
        }
        assertThat(table.runCount, equalTo(runs.values.sumOf { it.size }.toLong()))
    }

    @Test
    fun `bulk appends match brute force and release the build buffers`() {
        for (length in listOf(300, 70_000)) {
            // ids around the chunk boundaries 65535 / 65536 and in a later chunk
            val ids = (0 until 400).toList() + (65_400 until 65_700).toList() + (200_000 until 200_050).toList()
            val runs = randomRuns(length, ids, 0.6)
            val table = RunTable(length)
            for (id in runs.keys.sorted()) for ((s, e) in runs.getValue(id)) table.append(id, s, e)
            table.trim()
            assertThat(table.buildBufferBytes(), equalTo(0L))
            check(table, length, runs, ids)
        }
    }

    private fun layouts(table: RunTable): List<Boolean> {
        val field = RunTable::class.java.getDeclaredField("chunks").also { it.isAccessible = true }
        return (field.get(table) as Array<*>).filterNotNull().map { (it as RunTable.Chunk).locals == null }
    }

    @Test
    fun `rebuilds match brute force across dense and sparse layouts`() {
        for (length in listOf(300, 70_000)) {
            val ids = (0 until 300).toList() + (65_500 until 65_600).toList() + (131_000 until 131_072).toList()
            val runs = randomRuns(length, ids, 0.9).toMutableMap()
            val table = RunTable(length)
            for (id in runs.keys.sorted()) for ((s, e) in runs.getValue(id)) table.append(id, s, e)
            table.trim()
            check(table, length, runs, ids)
            val seen = HashSet<Boolean>()
            // waves: remove most ids (dense -> sparse), add many back (sparse -> dense), replace a few, empty all
            for ((removeShare, addShare) in listOf(0.9 to 0.0, 0.0 to 0.9, 0.05 to 0.05, 1.0 to 0.0, 0.0 to 0.02)) {
                val removed = ids.filter { random.nextDouble() < removeShare }
                val added = randomRuns(length, ids.filter { random.nextDouble() < addShare }, 1.0)
                val remove = RoaringBitmap.bitmapOf(*(removed + added.keys).distinct().toIntArray())
                val triples = added.flatMap { (id, list) -> list.flatMap { (s, e) -> listOf(id, s, e) } }
                table.install(table.rebuild(remove, triples.toIntArray()))
                removed.forEach { runs.remove(it) }
                added.forEach { (id, list) -> if (list.isEmpty()) runs.remove(id) else runs[id] = list }
                check(table, length, runs.filterValues { it.isNotEmpty() }, ids)
                seen.addAll(layouts(table))
            }
            assertThat("both layouts used", seen, equalTo(setOf(true, false)))
        }
    }

    @Test
    fun `sparse chunks are smaller than a dense offsets array`() {
        val table = RunTable(1000)
        for (id in 0 until 60_000 step 100) table.append(id, 10, 20)
        table.trim()
        assertThat(layouts(table), equalTo(listOf(false)))
        assertThat(table.memoryBytes() < 20_000, equalTo(true))
        val dense = RunTable(1000)
        for (id in 0 until 1000) dense.append(id, 10, 20)
        dense.trim()
        assertThat(layouts(dense), equalTo(listOf(true)))
    }

    @Test
    fun `bulk-loaded indexes keep no run-table build buffers`() {
        val schema = IndexTestSupport.schema()
        val rows = (0 until 300).map { id ->
            IndexRow.fromAlignedSequences(
                schema,
                id,
                mapOf(),
                mapOf("main" to "NNNNACGTACGTACGTACGTCAGTACGNNN", "E" to "XXSFVSEETGTLIVNSVLLF*"),
            )
        }
        val built = InMemoryOrganismIndex.build(schema, rows)
        val loaded = IndexLoader.load(
            schema,
            maxId = 299,
            readRange = { from, to, consumer -> rows.filter { it.id in from..to }.forEach(consumer) },
            dataVersion = 1,
            readers = 2,
            chunkSize = 64,
        )
        for (index in listOf(built, loaded)) {
            for (seq in schema.allSequences()) {
                val runs = index.sequenceIndex(seq.index).runs
                assertThat(runs.runCount, equalTo(300L * if (seq.name == "main") 2 else 1))
                assertThat(runs.buildBufferBytes(), equalTo(0L))
            }
        }
    }
}
