package org.loculus.backend.query.index

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThan
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
import org.loculus.backend.query.schema.SequenceSchema
import org.loculus.backend.query.schema.SequenceType
import org.roaringbitmap.RoaringBitmap
import kotlin.random.Random

/**
 * Differential test of the local reference ([SequenceIndex.adaptLocalReference]) and of gaps stored as runs
 * ([SequenceIndex.storeSparseGapsAsRuns]): sequences drawn from clades whose consensus differs from the reference
 * (substitutions, deletions, near-ties, mostly-missing regions), with noise, ambiguity codes, missing runs and
 * sparse deletions (1-60 positions, next to missing runs, at both ends, across 128-position blocks). Indexes with
 * local reference and / or gap runs must answer every filter, mutation count and position aggregation exactly
 * like one with neither and like the brute-force [Oracle], also after revisions, revocations and additions that
 * shift the majority away from the chosen implicit symbols.
 */
class LocalReferenceIndexTest {
    private val random = Random(7)
    private val nucRef = (1..700).map { "ACGT"[random.nextInt(4)] }.joinToString("")
    private val aaRef = (1..300).map { "ACDEFGHIKLMNPQRSTVWY"[random.nextInt(20)] }.joinToString("") + "*"
    private val schema: QuerySchema = IndexTestSupport.schema(
        nucleotide = mapOf("seg1" to nucRef, "seg2" to nucRef.take(200)),
        genes = mapOf("G" to aaRef),
    )
    private val nucSymbols = "-ACGT"
    private val nucNoise = "-ACGTRYSWKMBDHVN"
    private val aaSymbols = "-ACDEFGHIKLMNOPQRSTUVWY*"
    private val aaNoise = "-ACDEFGHIKLMNOPQRSTUVWYBJZ*X"

    /** consensus per clade and sequence: the reference with clade-defining changes */
    private fun clades(ref: String, symbols: String, count: Int): List<String> {
        val base = ref.toCharArray()
        // shared by all clades (fixed differences to the reference): the local reference differs everywhere
        for (i in base.indices) if (random.nextDouble() < 0.08) base[i] = symbols[random.nextInt(symbols.length)]
        return List(count) {
            val chars = base.copyOf()
            for (i in chars.indices) if (random.nextDouble() < 0.1) chars[i] = symbols[random.nextInt(symbols.length)]
            String(chars)
        }
    }

    private val nucClades = clades(nucRef, nucSymbols, 4)
    private val seg2Clades = clades(nucRef.take(200), nucSymbols, 4)
    private val aaClades = clades(aaRef, aaSymbols, 4)

    /** clade weights: 0 dominates, 1 and 2 nearly tie; [shift] favours the reference-like clade 3 (drift) */
    private fun clade(shift: Boolean): Int {
        if (shift) return if (random.nextDouble() < 0.8) 3 else random.nextInt(3)
        val x = random.nextDouble()
        return when {
            x < 0.45 -> 0
            x < 0.7 -> 1
            x < 0.93 -> 2
            else -> 3
        }
    }

    private fun sequence(consensus: String, noise: String, missing: Char, mostlyMissing: IntRange): String {
        val chars = consensus.toCharArray()
        for (i in chars.indices) if (random.nextDouble() < 0.02) chars[i] = noise[random.nextInt(noise.length)]
        if (random.nextDouble() < 0.5) for (i in 0 until random.nextInt(1, 40)) chars[i] = missing
        if (random.nextDouble() < 0.5) for (i in chars.size - random.nextInt(1, 40) until chars.size) chars[i] = missing
        // a region that most sequences lack (the implicit symbol is picked among the few that have it)
        if (random.nextDouble() < 0.8) for (i in mostlyMissing) if (i < chars.size) chars[i] = missing
        repeat(random.nextInt(0, 3)) {
            val start = random.nextInt(chars.size)
            val length = if (random.nextDouble() < 0.2) random.nextInt(100, 300) else random.nextInt(1, 8)
            for (i in start until minOf(chars.size, start + length)) chars[i] = missing
            // a deletion right next to the missing run
            if (random.nextDouble() < 0.1) {
                val end = minOf(chars.size, start + length)
                for (i in end until minOf(chars.size, end + random.nextInt(1, 10))) chars[i] = '-'
            }
        }
        deletions(chars)
        return String(chars)
    }

    /** sparse deletions (each position in few entries): the ones stored as gap runs */
    private fun deletions(chars: CharArray) {
        fun delete(from: Int, length: Int) {
            for (i in maxOf(0, from) until minOf(chars.size, from + length)) chars[i] = '-'
        }
        if (random.nextDouble() < 0.15) delete(random.nextInt(chars.size), random.nextInt(1, 61))
        if (random.nextDouble() < 0.03) delete(0, random.nextInt(1, 12))
        if (random.nextDouble() < 0.03) delete(chars.size - random.nextInt(1, 12), 12)
        // across the 128-position blocks of mutation counting and the run index checkpoints
        if (random.nextDouble() <
            0.04
        ) {
            delete(128 * random.nextInt(1, 3) - random.nextInt(1, 10), random.nextInt(2, 20))
        }
    }

    private fun randomRow(shift: Boolean = false): Map<String, String?> {
        val c = clade(shift)
        fun maybe(s: () -> String) = if (random.nextDouble() < 0.05) null else s()
        return mapOf(
            "seg1" to maybe { sequence(nucClades[c], nucNoise, 'N', 300..340) },
            "seg2" to maybe { sequence(seg2Clades[c], "-ACGTN", 'N', 150..160) },
            "G" to maybe { sequence(aaClades[c], aaNoise, 'X', 100..120) },
        )
    }

    private fun indexRow(id: Int, seqs: Map<String, String?>) = IndexRow.fromAlignedSequences(schema, id, mapOf(), seqs)

    private fun build(
        rows: Map<Int, Map<String, String?>>,
        localReference: Boolean,
        gapRuns: Boolean = localReference,
    ) = InMemoryOrganismIndex.build(
        schema,
        rows.map { (id, seqs) -> indexRow(id, seqs) },
        localReference = localReference,
        gapRuns = gapRuns,
    )

    private lateinit var hotPositions: Map<Int, IntArray>

    private fun randomLeaf(): Filter {
        val seq = schema.allSequences()[random.nextInt(3)]
        val hot = hotPositions.getValue(seq.index)
        val position = if (hot.isNotEmpty() && random.nextDouble() < 0.7) {
            hot[random.nextInt(hot.size)]
        } else {
            random.nextInt(1, seq.length + 1)
        }
        return when (random.nextInt(5)) {
            0 -> HasMutation(seq.index, position)
            1 -> SymbolEquals(seq.index, position, seq.referenceSymbolIndex(position))
            2 -> SymbolEquals(seq.index, position, seq.alphabet.missingIndex)
            else -> SymbolEquals(seq.index, position, random.nextInt(seq.alphabet.size))
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

    private fun check(
        variants: List<InMemoryOrganismIndex>,
        plain: InMemoryOrganismIndex,
        rows: Map<Int, Map<String, String?>>,
    ) {
        val oracle = Oracle(schema, rows)
        for (loader in listOf(false, true)) {
            val rowLoader: ((Collection<Int>) -> List<IndexRow>)? = if (loader) {
                { ids -> ids.filter { it in rows }.map { indexRow(it, rows.getValue(it)) } }
            } else {
                null
            }
            (variants + plain).forEach { it.rowLoader = rowLoader }
            val fallbacks = InMemoryOrganismIndex.complementRowFallbacks.get()
            for (variant in variants) checkWith(variant, plain, oracle)
            // with current rows, small complements are always counted from their rows (gap runs included)
            assertThat("complement fallbacks", InMemoryOrganismIndex.complementRowFallbacks.get(), equalTo(fallbacks))
        }
        (variants + plain).forEach { it.rowLoader = null }
    }

    private fun checkWith(local: InMemoryOrganismIndex, plain: InMemoryOrganismIndex, oracle: Oracle) {
        repeat(400) {
            val filter = randomFilter(random.nextInt(0, 4))
            val expected = plain.evaluate(filter).toArray().toSet()
            assertThat("$filter", local.evaluate(filter).toArray().toSet(), equalTo(expected))
            assertThat("oracle $filter", expected, equalTo(oracle.evaluate(filter)))
        }
        val keys = oracle.rows.keys
        val subsets = listOf(
            keys,
            keys.filter { random.nextDouble() < 0.3 }.toSet(),
            keys.filter { random.nextDouble() < 0.02 }.toSet(),
            keys.take(3).toSet(),
            keys - keys.first(),
            keys - keys.shuffled(random).take(40).toSet(),
            keys - keys.shuffled(random).take(150).toSet(),
            keys.filter { random.nextDouble() < 0.9 }.toSet(),
            oracle.evaluate(Maybe(randomLeaf())),
            oracle.evaluate(Not(randomLeaf())),
        )
        for (subset in subsets) {
            val bitmap = RoaringBitmap.bitmapOf(*subset.toIntArray())
            for (type in SequenceType.entries) {
                for (minProportion in listOf(0.0, 0.05, 0.3, 0.5, 0.9, 1.0)) {
                    val expected = plain.mutations(bitmap, type, minProportion)
                    val label = "mutations $type $minProportion subset ${subset.size}"
                    assertThat(label, local.mutations(bitmap, type, minProportion), equalTo(expected))
                    assertThat("oracle $label", expected, equalTo(oracle.mutations(subset, type, minProportion)))
                }
            }
            for (seq in schema.allSequences()) {
                val hot = hotPositions.getValue(seq.index)
                for (p in hot.take(5) + listOf(1, seq.length)) {
                    val field = "${seq.name}[$p]"
                    assertThat(
                        field,
                        local.aggregate(bitmap, listOf(field)),
                        equalTo(plain.aggregate(bitmap, listOf(field))),
                    )
                }
            }
        }
    }

    private fun localPositions(index: InMemoryOrganismIndex, seq: SequenceSchema) =
        index.sequenceIndex(seq.index).localReferencePositions

    /** positions whose gaps are stored as runs and that have some, and positions with a gap bitmap */
    private fun gapPositions(index: InMemoryOrganismIndex, seq: SequenceSchema): Pair<IntArray, IntArray> {
        val s = index.sequenceIndex(seq.index)
        val counts = s.gaps.countsAll()
        val runs = (1..seq.length).filter { s.gapAsRun(it) && counts[it] > 0 }.toIntArray()
        val bitmaps = (1..seq.length).filter { s.mutations[it]?.get(s.gapSymbol) != null }.toIntArray()
        return runs to bitmaps
    }

    /** positions to query often: local-reference positions, and gap-run and gap-bitmap positions */
    private fun hot(index: InMemoryOrganismIndex, seq: SequenceSchema): IntArray {
        val (runs, bitmaps) = gapPositions(index, seq)
        return localPositions(index, seq) + runs.take(40) + bitmaps.take(20)
    }

    @Test
    fun `local reference answers exactly like the reference-based index, also after updates`() {
        val rows = (0 until 1500).associateWith { randomRow() }.toMutableMap()
        val local = build(rows, localReference = true)
        val gapRunsOnly = build(rows, localReference = false, gapRuns = true)
        val plain = build(rows, localReference = false)
        val variants = listOf(local, gapRunsOnly)
        for (seq in schema.allSequences()) {
            assertThat("${seq.name} positions with local reference", localPositions(local, seq).size, greaterThan(10))
            assertThat(localPositions(plain, seq).size, equalTo(0))
            // the mixed case: sparse gaps as runs, dense ones (clade deletions) as bitmaps, in every sequence
            for (index in variants) {
                val (runs, bitmaps) = gapPositions(index, seq)
                assertThat("${seq.name} gap-run positions", runs.size, greaterThan(10))
                assertThat("${seq.name} gap-bitmap positions", bitmaps.size, greaterThan(2))
            }
            assertThat(gapPositions(plain, seq).first.size, equalTo(0))
        }
        val chosen = schema.allSequences().associate { it.index to localPositions(local, it).clone() }
        hotPositions = schema.allSequences().associate { it.index to hot(local, it) }
        assertThat(local.sequenceIndex(0).localReferenceExcess(), equalTo(0L))
        check(variants, plain, rows)

        // revisions, revocations and additions after the load (batch sizes cover all removal strategies);
        // the "shifted" rows mostly carry the reference, so the implicit symbols stop being the majority
        var nextId = 2000
        for ((changes, shift) in listOf(300 to false, 12 to true, 1 to true, 600 to true, 40 to false)) {
            val updated = rows.keys.shuffled(random).take(changes * 2 / 3).associateWith { randomRow(shift) }
            val deleted = rows.keys.shuffled(random).take(changes / 3).filter { it !in updated }
            val added = (nextId until nextId + changes / 3 + 1).associateWith { randomRow(shift) }
            nextId += changes + 1
            for (index in variants + plain) {
                index.apply((updated + added).map { (id, seqs) -> indexRow(id, seqs) }, deleted + listOf(99_999))
            }
            rows.putAll(updated)
            rows.putAll(added)
            deleted.forEach { rows.remove(it) }
            assertThat(local.size, equalTo(rows.size))
            check(variants, plain, rows)
        }
        // updates keep the implicit symbols; the drift shows up as excess stored entries
        for (seq in schema.allSequences()) {
            assertThat(localPositions(local, seq).toList(), equalTo(chosen.getValue(seq.index).toList()))
        }
        assertThat(local.sequenceIndex(0).localReferenceExcess(), greaterThan(0L))
        assertThat(local.evaluate(True).toArray().toSet(), equalTo(rows.keys))
    }

    @Test
    fun `local reference stores fewer entries and the parallel loader picks the same one`() {
        val rows = (0 until 1200).associateWith { randomRow() }
        val indexRows = rows.map { (id, seqs) -> indexRow(id, seqs) }
        val loaded = IndexLoader.load(
            schema,
            maxId = 1199,
            readRange = { from, to, consumer -> indexRows.filter { it.id in from..to }.forEach(consumer) },
            dataVersion = 1,
            readers = 3,
            chunkSize = 100,
        )
        val built = build(rows, localReference = true)
        val plain = build(rows, localReference = false)
        for (seq in schema.allSequences()) {
            assertThat(localPositions(loaded, seq).toList(), equalTo(localPositions(built, seq).toList()))
            assertThat(gapPositions(loaded, seq).first.toList(), equalTo(gapPositions(built, seq).first.toList()))
            fun stored(index: InMemoryOrganismIndex) = index.sequenceIndex(seq.index).mutations.sumOf { perSymbol ->
                perSymbol?.sumOf { it?.longCardinality ?: 0L } ?: 0L
            }
            assertThat("${seq.name} stored entries", stored(plain) - stored(built), greaterThan(0L))
        }
        hotPositions = schema.allSequences().associate { it.index to hot(built, it) }
        check(listOf(loaded), plain, rows)
    }
}
