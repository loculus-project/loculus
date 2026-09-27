package org.loculus.backend.query.index

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.loculus.backend.query.filter.And
import org.loculus.backend.query.filter.Filter
import org.loculus.backend.query.filter.HasMutation
import org.loculus.backend.query.filter.InsertionContains
import org.loculus.backend.query.filter.Maybe
import org.loculus.backend.query.filter.NOf
import org.loculus.backend.query.filter.Not
import org.loculus.backend.query.filter.StringEquals
import org.loculus.backend.query.filter.SymbolEquals
import org.loculus.backend.query.filter.True
import org.loculus.backend.query.schema.Alphabet
import org.loculus.backend.query.schema.SequenceType

/**
 * Reconstructs the [live] distributions of LAPIS_SEMANTICS.md sections 1-3 (SARS-CoV-2 position 21, E:9,
 * insertions) and checks the documented LAPIS results.
 */
class LapisSemanticsIndexTest {
    // position 21 of "main" is 'C', E:9 is 'T'
    private val schema = IndexTestSupport.schema()
    private val nuc = Alphabet.NUCLEOTIDE
    private val aa = Alphabet.AMINO_ACID
    private val mainRef = schema.nucleotideSequences[0].reference
    private val eRef = schema.genes[0].reference

    private val pos21 = linkedMapOf('-' to 22, 'A' to 11, 'C' to 8259, 'T' to 6872, 'Y' to 7, 'M' to 1, 'N' to 59082)
    private val e9 = linkedMapOf('I' to 48465, 'L' to 1, 'S' to 1, 'T' to 24950, 'V' to 7, 'X' to 818)
    private val noSequence = 12

    private val index: InMemoryOrganismIndex = run {
        require(mainRef[20] == 'C' && eRef[8] == 'T')
        val nucSymbols = pos21.flatMap { (c, n) -> List(n) { c } }
        val aaSymbols = e9.flatMap { (c, n) -> List(n) { c } }
        val total = maxOf(nucSymbols.size, aaSymbols.size) + noSequence
        val rows = (0 until total).map { id ->
            val sequences = mutableMapOf<String, String?>()
            if (id < nucSymbols.size) sequences["main"] = mainRef.replaceRange(20, 21, nucSymbols[id].toString())
            if (id < aaSymbols.size) sequences["E"] = eRef.replaceRange(8, 9, aaSymbols[id].toString())
            val insertions = mutableMapOf<String, List<String>>()
            if (id < 89) insertions["main"] = listOf("28:TGTC")
            if (id in 1000 until 1006) insertions["main"] = listOf("28:TGAAC")
            if (id < 1962) insertions["E"] = listOf("14:EPE")
            if (id in 5000 until 5006) insertions["E"] = listOf("14:EPEAB")
            IndexRow.fromAlignedSequences(schema, id, mapOf("accessionVersion" to "A$id.1"), sequences, insertions)
        }
        allRows = rows.associateBy { it.id }
        InMemoryOrganismIndex.build(schema, rows)
    }

    private lateinit var allRows: Map<Int, IndexRow>

    private fun count(filter: Filter) = index.evaluate(filter).cardinality

    private fun sym(pos: Int, c: Char) = SymbolEquals(0, pos, nuc.indexOf(c))

    private fun aaSym(pos: Int, c: Char) = SymbolEquals(1, pos, aa.indexOf(c))

    @Test
    fun `nucleotide position 21 examples`() {
        assertThat(count(HasMutation(0, 21)), equalTo(6905))
        assertThat(count(sym(21, 'C')), equalTo(8259))
        assertThat(count(sym(21, 'N')), equalTo(59082))
        assertThat(count(sym(21, 'Y')), equalTo(7))
        assertThat(count(sym(21, '-')), equalTo(22))
        assertThat(count(Maybe(sym(21, 'T'))), equalTo(65961))
        assertThat(count(Maybe(HasMutation(0, 21))), equalTo(65995))
        assertThat(count(Maybe(sym(21, 'C'))), equalTo(67349))
    }

    @Test
    fun `rows without sequence never match positive symbol filters but match NOT`() {
        val total = index.size
        assertThat(total, equalTo(pos21.values.sum() + noSequence))
        assertThat(count(Not(sym(21, 'N'))), equalTo(total - 59082))
        assertThat(count(Not(HasMutation(0, 21))), equalTo(total - 6905))
        assertThat(count(Maybe(sym(21, 'N'))), equalTo(59082))
    }

    @Test
    fun `NOT flips UPPER and LOWER bound`() {
        // NOT maybe(21T): maybe sets UPPER regardless of the incoming mode
        assertThat(count(Not(Maybe(sym(21, 'T')))), equalTo(index.size - 65961))
        // maybe(NOT 21T): the inner symbol filter runs in LOWER_BOUND = exact symbol
        assertThat(count(Maybe(Not(sym(21, 'T')))), equalTo(index.size - 6872))
        // maybe(NOT 21): HasMutation in LOWER_BOUND = like NONE
        assertThat(count(Maybe(Not(HasMutation(0, 21)))), equalTo(index.size - 6905))
        // maybe(NOT NOT 21T) -> UPPER again
        assertThat(count(Maybe(Not(Not(sym(21, 'T'))))), equalTo(65961))
    }

    @Test
    fun `amino acid E9 examples`() {
        assertThat(count(HasMutation(1, 9)), equalTo(48474))
        assertThat(count(aaSym(9, 'T')), equalTo(24950))
        assertThat(count(aaSym(9, 'X')), equalTo(818))
        assertThat(count(Maybe(aaSym(9, 'I'))), equalTo(49283))
    }

    @Test
    fun `nucleotide mutations report C21T with valid-symbol coverage`() {
        val rows = index.mutations(index.evaluate(True), SequenceType.NUCLEOTIDE, 0.05)
        val c21 = rows.filter { it.position == 21 }
        assertThat(c21.map { it.symbolTo }, contains('T'))
        assertThat(c21[0].count, equalTo(6872L))
        assertThat(c21[0].coverage, equalTo(15164L))
        assertThat(c21[0].proportion, equalTo(0.4531785808493801))
        // minProportion 0: deletion and A are reported too, N / Y / M and the reference never
        val all = index.mutations(index.evaluate(True), SequenceType.NUCLEOTIDE, 0.0).filter { it.position == 21 }
        assertThat(all.map { it.symbolTo }, contains('-', 'A', 'T'))
        assertThat(all.map { it.count }, contains(22L, 11L, 6872L))
    }

    @Test
    fun `filtered mutations equal full mutations on the same set`() {
        val some = index.evaluate(Not(StringEquals("accessionVersion", "A0.1")))
        val filtered = index.mutations(some, SequenceType.NUCLEOTIDE, 0.0).filter { it.position == 21 }
        // A0 has '-' at 21
        assertThat(filtered.map { it.count }, contains(21L, 11L, 6872L))
        assertThat(filtered.map { it.coverage }, contains(15163L, 15163L, 15163L))
    }

    @Test
    fun `amino acid mutations exclude X and the reference`() {
        val rows = index.mutations(index.evaluate(True), SequenceType.AMINO_ACID, 0.0).filter { it.position == 9 }
        assertThat(rows.map { it.symbolTo }, contains('I', 'L', 'S', 'V'))
        assertThat(rows[0].coverage, equalTo(48465L + 1 + 1 + 24950 + 7))
    }

    @Test
    fun `insertion filters use full match at exactly the position`() {
        assertThat(count(InsertionContains(0, 28, "TGTC")), equalTo(89))
        assertThat(count(InsertionContains(0, 28, "T.*C")), equalTo(95))
        assertThat(count(InsertionContains(0, 28, "TG")), equalTo(0))
        assertThat(count(InsertionContains(0, 27, ".*")), equalTo(0))
        assertThat(count(InsertionContains(1, 14, "EPE")), equalTo(1962))
        assertThat(count(InsertionContains(1, 14, "E.*")), equalTo(1968))
    }

    @Test
    fun `insertion aggregation`() {
        val all = index.evaluate(True)
        val nucRows = index.insertions(all, SequenceType.NUCLEOTIDE)
        assertThat(
            nucRows,
            containsInAnyOrder(InsertionRow(0, 28, "TGAAC", 6), InsertionRow(0, 28, "TGTC", 89)),
        )
        val aaRows = index.insertions(
            index.evaluate(StringEquals("accessionVersion", "A5000.1")),
            SequenceType.AMINO_ACID,
        )
        assertThat(aaRows, contains(InsertionRow(1, 14, "EPEAB", 1)))
        assertThat(index.insertions(org.roaringbitmap.RoaringBitmap(), SequenceType.AMINO_ACID), empty())
    }

    @Test
    fun `n-of at least and exactly`() {
        val a = sym(21, 'T')
        val b = Maybe(sym(21, 'T')) // superset of a
        val c = StringEquals("accessionVersion", "A30000.1") // one row with T at 21? (id 30000 is 'T' region)
        assertThat(count(NOf(1, false, listOf(a, b))), equalTo(65961))
        assertThat(count(NOf(2, false, listOf(a, b))), equalTo(6872))
        assertThat(count(NOf(1, true, listOf(a, b))), equalTo(65961 - 6872))
        assertThat(count(NOf(0, true, listOf(a, b))), equalTo(index.size - 65961))
        assertThat(count(NOf(0, false, listOf(a, b))), equalTo(index.size))
        assertThat(count(NOf(3, false, listOf(a, b))), equalTo(0))
        assertThat(count(NOf(3, true, listOf(a, b, c))), equalTo(if (count(And(listOf(a, c))) == 1) 1 else 0))
    }

    @Test
    fun `small id sets counted from rows equal the bitmap path`() {
        val sets = listOf(
            (0 until 200).toList(),
            (980 until 1010).toList(),
            listOf(5001, 5002, 70000, 80000),
            listOf(74260),
        )
        for (ids in sets) {
            val bitmap = org.roaringbitmap.RoaringBitmap.bitmapOf(*ids.toIntArray())
            index.rowLoader = null
            val expected = SequenceType.entries.map {
                index.mutations(bitmap, it, 0.0) to index.insertions(bitmap, it)
            } + (index.mutations(bitmap, SequenceType.NUCLEOTIDE, 0.3) to emptyList())
            index.rowLoader = { requested -> requested.mapNotNull { allRows[it] } }
            val actual = SequenceType.entries.map {
                index.mutations(bitmap, it, 0.0) to index.insertions(bitmap, it)
            } + (index.mutations(bitmap, SequenceType.NUCLEOTIDE, 0.3) to emptyList())
            index.rowLoader = null
            assertThat("$ids", actual, equalTo(expected))
        }
    }
}
