package org.loculus.backend.query.index

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.lessThanOrEqualTo
import org.junit.jupiter.api.Test
import org.loculus.backend.query.filter.HasMutation
import org.loculus.backend.query.filter.StringEquals
import org.loculus.backend.query.filter.SymbolEquals
import org.loculus.backend.query.filter.True
import org.loculus.backend.query.schema.SequenceType
import org.roaringbitmap.RoaringBitmap
import org.roaringbitmap.RunContainer
import kotlin.random.Random

/** bitmaps changed by apply() are re-compressed afterwards, as after a bulk load */
class CompactionTest {
    private val random = Random(5)
    private val ref = (1..400).map { "ACGT"[random.nextInt(4)] }.joinToString("")
    private val schema = IndexTestSupport.schema(nucleotide = mapOf("main" to ref))

    private fun row(id: Int): IndexRow {
        val chars = ref.toCharArray()
        // clade-like: runs of ids share mutations, so bitmaps get long runs
        val clade = id / 150
        for (i in chars.indices) {
            val shared = (i * 7 + clade) % 23 == 0
            if (shared || random.nextDouble() < 0.01) chars[i] = "-ACGT"[random.nextInt(5)]
        }
        if (random.nextDouble() < 0.5) for (i in 0 until random.nextInt(1, 30)) chars[i] = 'N'
        return IndexRow.fromAlignedSequences(
            schema,
            id,
            mapOf("accessionVersion" to "A$id.1", "country" to listOf("CH", "DE", "US")[clade % 3]),
            mapOf("main" to String(chars), "E" to "MYSFVSEETGTLIVNSVLLF*"),
        )
    }

    private fun assertCompact(index: InMemoryOrganismIndex) {
        for (s in schema.allSequences()) {
            val seq = index.sequenceIndex(s.index)
            val bitmaps = ArrayList<RoaringBitmap>()
            bitmaps.add(seq.present)
            seq.mutations.forEach { it?.forEach { bm -> bm?.let(bitmaps::add) } }
            for (runs in listOf(seq.missing, seq.gaps)) {
                bitmaps.addAll(runs.starts.bitmaps())
                bitmaps.addAll(runs.ends.bitmaps())
                bitmaps.addAll(runs.checkpoints)
            }
            for (bm in bitmaps) {
                assertThat(heapBytes(bm), equalTo(heapBytes(runOptimizeFewRuns(bm.clone()))))
                val p = bm.containerPointer
                while (p.container != null) {
                    val c = p.container
                    if (c is RunContainer) assertThat(c.numberOfRuns(), lessThanOrEqualTo(MAX_RUNS_PER_CONTAINER))
                    p.advance()
                }
            }
        }
    }

    @Test
    fun `an index built by updates is as compact as a bulk-loaded one and answers the same`() {
        val rows = (0 until 3000).map { row(it) }
        val bulk = InMemoryOrganismIndex.build(schema, rows)
        assertCompact(bulk)
        val updated = InMemoryOrganismIndex.build(schema, emptyList())
        for (from in rows.indices step 250) updated.apply(rows.subList(from, from + 250), emptyList())
        // revisions (same content) and a deletion followed by re-adding
        updated.apply((0 until 3000 step 7).map { rows[it] }, listOf(11, 12))
        updated.apply(listOf(rows[11], rows[12]), emptyList())
        assertCompact(updated)
        val bulkUsage = bulk.memoryUsage()
        val updatedUsage = updated.memoryUsage()
        // metadata columns differ by the capacity of their per-id arrays, which grows with updates
        for ((key, bytes) in updatedUsage.filterKeys { !it.startsWith("metadata:") }) {
            assertThat(key, bytes.toDouble(), lessThanOrEqualTo(bulkUsage.getValue(key) * 1.02 + 256))
        }
        val all = RoaringBitmap.bitmapOfRange(0, 3000)
        for (filter in listOf(True, StringEquals("country", "DE"), SymbolEquals(0, 7, 0), HasMutation(0, 24))) {
            assertThat("$filter", updated.evaluate(filter), equalTo(bulk.evaluate(filter)))
        }
        for (type in SequenceType.entries) {
            assertThat(updated.mutations(all, type, 0.0), equalTo(bulk.mutations(all, type, 0.0)))
        }
    }
}
