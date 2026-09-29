package org.loculus.backend.query.index

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.loculus.backend.query.filter.And
import org.loculus.backend.query.filter.Filter
import org.loculus.backend.query.filter.HasMutation
import org.loculus.backend.query.filter.Maybe
import org.loculus.backend.query.filter.NOf
import org.loculus.backend.query.filter.Not
import org.loculus.backend.query.filter.Or
import org.loculus.backend.query.filter.SymbolEquals
import org.loculus.backend.query.filter.True
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.schema.SequenceType
import org.roaringbitmap.RoaringBitmap
import kotlin.random.Random

/**
 * Compares filters and mutation counts against a brute-force oracle on random aligned sequences with random
 * missing runs (spanning several checkpoint blocks), including after incremental updates.
 */
class RandomizedIndexTest {
    private val random = Random(42)
    private val nucRef = (1..700).map { "ACGT"[random.nextInt(4)] }.joinToString("")
    private val aaRef = (1..300).map { "ACDEFGHIKLMNPQRSTVWY"[random.nextInt(20)] }.joinToString("") + "*"
    private val schema: QuerySchema = IndexTestSupport.schema(
        nucleotide = mapOf("seg1" to nucRef, "seg2" to nucRef.take(200)),
        genes = mapOf("G" to aaRef),
    )

    private fun randomSequence(ref: String, symbols: String, missing: Char): String {
        val chars = ref.toCharArray()
        // a few "hot" positions with lots of variation plus random noise
        for (i in chars.indices) {
            val hot = i % 37 == 5 || i == 1 || i == chars.size - 1
            if (random.nextDouble() < (if (hot) 0.5 else 0.01)) chars[i] = symbols[random.nextInt(symbols.length)]
        }
        // missing runs: leading, trailing, internal (some long ones crossing checkpoints)
        if (random.nextDouble() < 0.6) for (i in 0 until random.nextInt(1, 60)) chars[i] = missing
        if (random.nextDouble() < 0.6) for (i in chars.size - random.nextInt(1, 60) until chars.size) chars[i] = missing
        repeat(random.nextInt(0, 4)) {
            val start = random.nextInt(chars.size)
            val length = if (random.nextDouble() < 0.2) random.nextInt(100, 400) else random.nextInt(1, 10)
            for (i in start until minOf(chars.size, start + length)) chars[i] = missing
        }
        return String(chars)
    }

    private fun randomRow(id: Int): Map<String, String?> {
        fun maybe(s: () -> String) = if (random.nextDouble() < 0.05) null else s()
        return mapOf(
            "seg1" to maybe { randomSequence(nucRef, "-ACGTRYSWKMBDHVN", 'N') },
            "seg2" to maybe { randomSequence(nucRef.take(200), "-ACGTN", 'N') },
            "G" to maybe { randomSequence(aaRef, "-ACDEFGHIKLMNOPQRSTUVWYBJZ*X", 'X') },
        )
    }

    private fun build(rows: Map<Int, Map<String, String?>>) = InMemoryOrganismIndex.build(
        schema,
        rows.map { (id, seqs) -> IndexRow.fromAlignedSequences(schema, id, mapOf(), seqs) },
    )

    private fun randomLeaf(): Filter {
        val seq = schema.allSequences()[random.nextInt(3)]
        val position = if (random.nextBoolean()) {
            1 + 37 * random.nextInt(seq.length / 37) + 5
        } else {
            random.nextInt(
                1,
                seq.length + 1,
            )
        }
        return if (random.nextInt(4) == 0) {
            HasMutation(seq.index, position.coerceAtMost(seq.length))
        } else {
            SymbolEquals(seq.index, position.coerceAtMost(seq.length), random.nextInt(seq.alphabet.size))
        }
    }

    private fun randomFilter(depth: Int): Filter {
        if (depth == 0) return randomLeaf()
        return when (random.nextInt(6)) {
            0 -> And(List(random.nextInt(1, 4)) { randomFilter(depth - 1) })

            1 -> Or(List(random.nextInt(1, 4)) { randomFilter(depth - 1) })

            2 -> Not(randomFilter(depth - 1))

            3 -> Maybe(randomFilter(depth - 1))

            4 -> {
                val children = List(random.nextInt(1, 5)) { randomFilter(depth - 1) }
                NOf(random.nextInt(0, children.size + 2), random.nextBoolean(), children)
            }

            else -> randomLeaf()
        }
    }

    private fun check(index: InMemoryOrganismIndex, oracle: Oracle) {
        index.rowLoader = null
        checkWith(index, oracle)
        // small id sets are counted from their rows
        index.rowLoader = { ids ->
            ids.filter {
                it in oracle.rows
            }.map { IndexRow.fromAlignedSequences(schema, it, mapOf(), oracle.rows.getValue(it)) }
        }
        checkWith(index, oracle)
        index.rowLoader = null
    }

    private fun checkWith(index: InMemoryOrganismIndex, oracle: Oracle) {
        repeat(300) {
            val filter = randomFilter(random.nextInt(0, 4))
            val expected = oracle.evaluate(filter)
            assertThat("$filter", index.evaluate(filter).toArray().toSet(), equalTo(expected))
        }
        val subsets = listOf(
            oracle.rows.keys,
            oracle.rows.keys.filter { random.nextDouble() < 0.3 }.toSet(),
            oracle.rows.keys.filter { random.nextDouble() < 0.01 }.toSet(),
            oracle.rows.keys.filter { random.nextDouble() < 0.1 }.toSet(),
            oracle.rows.keys.take(1).toSet(),
            // almost all: counted as all minus the complement
            oracle.rows.keys - oracle.rows.keys.first(),
            oracle.rows.keys - oracle.rows.keys.shuffled(random).take(7).toSet(),
            oracle.rows.keys.filter { random.nextDouble() < 0.9 }.toSet(),
            oracle.evaluate(Maybe(randomLeaf())),
        )
        for (subset in subsets) {
            val bitmap = RoaringBitmap.bitmapOf(*subset.toIntArray())
            for (type in SequenceType.entries) {
                for (minProportion in listOf(0.0, 0.01, 0.05, 0.3, 0.5, 1.0)) {
                    assertThat(
                        "mutations $type $minProportion subset ${subset.size}",
                        index.mutations(bitmap, type, minProportion),
                        equalTo(oracle.mutations(subset, type, minProportion)),
                    )
                }
            }
        }
        // missing symbol point queries in every mode
        for (seq in schema.allSequences()) {
            for (p in listOf(1, 2, 127, 128, 129, 255, 256, 257, seq.length - 1, seq.length).filter {
                it <= seq.length
            }) {
                val f = SymbolEquals(seq.index, p, seq.alphabet.missingIndex)
                assertThat("$f", index.evaluate(f).toArray().toSet(), equalTo(oracle.evaluate(f)))
            }
        }
    }

    @Test
    fun `filters and mutations match the oracle, also after updates`() {
        val rows = (0 until 1500).associateWith { randomRow(it) }.toMutableMap()
        val index = build(rows)
        check(index, Oracle(schema, rows))

        // updates: modify, delete, add; batch sizes cover all removal strategies (probe, probe + intersects, andNot)
        var nextId = 2000
        for ((changes, checks) in listOf(300 to true, 10 to false, 1 to false, 100 to true)) {
            val updated = rows.keys.shuffled(random).take(changes * 2 / 3).associateWith { randomRow(it) }
            val deleted = rows.keys.shuffled(random).take(changes / 3).filter { it !in updated }
            val added = (nextId until nextId + changes / 3).associateWith { randomRow(it) }
            nextId += changes
            index.apply(
                (updated + added).map { (id, seqs) -> IndexRow.fromAlignedSequences(schema, id, mapOf(), seqs) },
                deleted + listOf(99_999),
            )
            rows.putAll(updated)
            rows.putAll(added)
            deleted.forEach { rows.remove(it) }
            assertThat(index.size, equalTo(rows.size))
            if (checks) check(index, Oracle(schema, rows))
        }
        check(index, Oracle(schema, rows))
        assertThat(index.evaluate(True).toArray().toSet(), equalTo(rows.keys))
    }

    @Test
    fun `parallel loader builds the same index`() {
        val rows = (0 until 1200).filter { it % 7 != 3 }.associateWith { randomRow(it) }
        val indexRows = rows.map { (id, seqs) -> IndexRow.fromAlignedSequences(schema, id, mapOf(), seqs) }
        val index = IndexLoader.load(
            schema,
            maxId = 1199,
            readRange = { from, to, consumer -> indexRows.filter { it.id in from..to }.forEach(consumer) },
            dataVersion = 5,
            readers = 3,
            chunkSize = 100,
        )
        assertThat(index.dataVersion, equalTo(5L))
        assertThat(index.size, equalTo(rows.size))
        check(index, Oracle(schema, rows))
    }
}
