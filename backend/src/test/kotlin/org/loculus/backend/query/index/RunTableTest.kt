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
