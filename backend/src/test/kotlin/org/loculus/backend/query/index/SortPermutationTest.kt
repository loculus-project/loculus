package org.loculus.backend.query.index

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasKey
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.loculus.backend.query.request.OrderByField
import org.loculus.backend.query.request.OrderDirection.ASCENDING
import org.loculus.backend.query.request.OrderDirection.DESCENDING
import org.loculus.backend.query.schema.FieldType
import org.loculus.backend.query.schema.MetadataField
import org.loculus.backend.query.schema.QuerySchema
import org.roaringbitmap.RoaringBitmap
import kotlin.random.Random

/** select() through the default-sort permutation returns exactly what the top-k / full sort returns */
class SortPermutationTest {
    private val metadata = listOf(
        MetadataField("accessionVersion", FieldType.STRING),
        MetadataField("date", FieldType.DATE),
        MetadataField("country", FieldType.STRING, generateIndex = true),
        MetadataField("host", FieldType.STRING),
        MetadataField("age", FieldType.INT),
        MetadataField("score", FieldType.FLOAT),
    )

    private fun schema(defaultOrderBy: String?, descending: Boolean) =
        IndexTestSupport.schema(metadata = metadata).copy(
            defaultOrderBy = defaultOrderBy,
            defaultOrderDescending = descending,
        )

    @AfterEach
    fun reset() {
        InMemoryOrganismIndex.usePermutations = true
    }

    private class Data(val random: Random, val dates: Int) {
        fun row(schema: QuerySchema, id: Int): IndexRow {
            fun <T> maybe(p: Double, v: () -> T): T? = if (random.nextDouble() < p) null else v()
            return IndexRow.of(
                schema,
                id,
                mapOf(
                    "accessionVersion" to "A$id.1",
                    // few distinct dates: long runs of equal keys, and many nulls
                    "date" to maybe(0.3) { "2020-01-%02d".format(1 + random.nextInt(dates)) },
                    "country" to maybe(0.2) { listOf("CH", "DE", "FR", "US", "Ä", "")[random.nextInt(6)] },
                    "host" to maybe(0.1) { "h${random.nextInt(50)}" },
                    "age" to maybe(0.2) { random.nextInt(-5, 90) },
                    "score" to maybe(0.2) { listOf(-0.0, 0.0, 1.5, -2.25, 3.0)[random.nextInt(5)] },
                ),
            )
        }
    }

    private fun randomSelection(random: Random, alive: IntArray): RoaringBitmap {
        val density = listOf(1.0, 0.7, 0.2, 1.0 / 40, 1.0 / 100, 0.002)[random.nextInt(6)]
        val bm = RoaringBitmap()
        alive.forEach { if (random.nextDouble() < density) bm.add(it) }
        // ids that are not (or no longer) in the index are ignored by select
        repeat(3) { bm.add(random.nextInt(0, 20_000)) }
        return bm
    }

    private fun randomOrder(random: Random, firstKey: String): List<OrderByField> {
        fun dir() = if (random.nextBoolean()) ASCENDING else DESCENDING
        val others = listOf("country", "host", "age", "score", "date").filter { it != firstKey }.shuffled(random)
        return when (random.nextInt(5)) {
            0, 1 -> listOf(OrderByField(firstKey, dir()))
            2 -> listOf(OrderByField(firstKey, dir()), OrderByField(others[0], dir()))
            3 -> listOf(OrderByField(firstKey, dir()), OrderByField(others[0], dir()), OrderByField(others[1], dir()))
            else -> listOf(OrderByField(others[0], dir())) // no permutation: the usual path
        }
    }

    /** a third of the ids from one end of the order by [key]: all at the end of the walk in one direction */
    private fun correlatedSelection(index: InMemoryOrganismIndex, random: Random, key: String): RoaringBitmap {
        InMemoryOrganismIndex.usePermutations = false
        val all = index.evaluate(org.loculus.backend.query.filter.True)
        val order = index.select(all, listOf(OrderByField(key, ASCENDING)), null, 0, null)
        InMemoryOrganismIndex.usePermutations = true
        val part = order.size / 3
        return RoaringBitmap.bitmapOf(
            *(
                if (random.nextBoolean()) {
                    order.copyOf(part)
                } else {
                    order.copyOfRange(order.size - part, order.size)
                }
                ),
        )
    }

    private fun compare(
        index: InMemoryOrganismIndex,
        random: Random,
        firstKey: String,
        rounds: Int,
        correlated: Double = 0.25,
    ) {
        val alive = index.evaluate(org.loculus.backend.query.filter.True).toArray()
        repeat(rounds) {
            val ids = if (random.nextDouble() < correlated) {
                correlatedSelection(index, random, firstKey)
            } else {
                randomSelection(random, alive)
            }
            val orderBy = randomOrder(random, firstKey)
            val n = ids.cardinality
            val offset = when (random.nextInt(4)) {
                0 -> 0
                1 -> random.nextInt(0, 50)
                2 -> random.nextInt(0, n + 5)
                else -> n / 2
            }
            val limit = listOf(null, 1, 7, 100, 1000, n + 10)[random.nextInt(6)]
            InMemoryOrganismIndex.usePermutations = false
            val expected = index.select(ids, orderBy, null, offset, limit)
            InMemoryOrganismIndex.usePermutations = true
            val actual = index.select(ids, orderBy, null, offset, limit)
            assertThat("$orderBy offset=$offset limit=$limit n=$n", actual.toList(), equalTo(expected.toList()))
        }
    }

    private fun check(defaultOrderBy: String, descending: Boolean, dates: Int, seed: Int, size: Int = 6000) {
        val random = Random(seed)
        val data = Data(random, dates)
        val schema = schema(defaultOrderBy, descending)
        val live = (0 until size).map { it * 2 + random.nextInt(2) }.toMutableSet()
        val index = InMemoryOrganismIndex.build(schema, live.sorted().map { data.row(schema, it) })
        assertThat(index.memoryUsage(), hasKey("sortPermutation:$defaultOrderBy"))
        compare(index, random, defaultOrderBy, 300)
        // updates: changed keys, deletions, re-added ids and new ids; ~1,800 changes cross the rebuild threshold
        repeat(6) {
            val existing = live.toList()
            val deleted = existing.shuffled(random).take(100)
            live.removeAll(deleted.toSet())
            val changed = live.shuffled(random).take(150)
            val readded = deleted.take(30)
            val added = (0 until 20).map { 15_000 + random.nextInt(5000) }.filter { it !in live }
            live.addAll(readded + added)
            val upserts = (changed + readded + added).distinct().map { data.row(schema, it) }
            index.apply(upserts, deleted.drop(30))
            compare(index, random, defaultOrderBy, 150)
        }
    }

    @Test
    fun `date permutation matches the sort, descending default`() = check("date", true, dates = 12, seed = 1)

    @Test
    fun `date permutation matches the sort, ascending default and all keys distinct-ish`() =
        check("date", false, dates = 28, seed = 2)

    @Test
    fun `string permutation matches the sort, with values added to the dictionary by updates`() =
        check("host", true, dates = 5, seed = 3)

    @Test
    fun `int and float permutations match the sort`() {
        check("age", false, dates = 5, seed = 4)
        check("score", true, dates = 5, seed = 5)
    }

    @Test
    fun `an index without a default sort or grown only by updates has no permutation until it is rebuilt`() {
        val random = Random(6)
        val data = Data(random, 10)
        val none = InMemoryOrganismIndex.build(
            schema(null, false),
            (0 until 100).map {
                data.row(schema(null, false), it)
            },
        )
        assertThat(none.memoryUsage(), not(hasKey("sortPermutation:date")))

        val schema = schema("date", true)
        val index = InMemoryOrganismIndex(schema)
        index.apply((0 until 500).map { data.row(schema, it) }, emptyList())
        // the first apply builds it, since there was none
        assertThat(index.memoryUsage(), hasKey("sortPermutation:date"))
        compare(index, random, "date", 200)
    }

    @Test
    fun `selections at one end of the order give up the walk and sort as usual`() {
        // large enough that the walk's step budget is below the positions it would have to skip
        val random = Random(8)
        val data = Data(random, 3000)
        val schema = schema("age", true)
        val index = InMemoryOrganismIndex.build(schema, (0 until 60_000).map { data.row(schema, it) })
        compare(index, random, "age", 60, correlated = 1.0)
    }

    @Test
    fun `the walk gives up on a selection at the far end of the order`() {
        val order = IntArray(10_000) { it }
        val permutation = SortPermutation.of(
            IndexTestSupport.schema().let {
                Column.create(it.metadata[0], 16)
            },
            false,
            order,
        ) { it.toLong() }
        val live = RoaringBitmap.bitmapOfRange(9_990, 10_000)
        assertThat(
            permutation.candidates(live, null, 5, forward = true, wholeRuns = false, 100, maxSteps = 100),
            equalTo(null),
        )
        assertThat(
            permutation.candidates(live, null, 5, forward = true, wholeRuns = false, 100, maxSteps = 20_000)?.toList(),
            equalTo(listOf(9_990, 9_991, 9_992, 9_993, 9_994)),
        )
        assertThat(
            permutation.candidates(live, null, 5, forward = false, wholeRuns = false, 100, maxSteps = 100)?.toList(),
            equalTo(listOf(9_999, 9_998, 9_997, 9_996, 9_995)),
        )
    }

    @Test
    fun `stale entries are merged into the page and cleared by a rebuild`() {
        val schema = schema("date", true)
        val rows = (0 until 5000).map {
            IndexRow.of(schema, it, mapOf("accessionVersion" to "A$it.1", "date" to "2020-01-01"))
        }
        val index = InMemoryOrganismIndex.build(schema, rows)
        val all = RoaringBitmap.bitmapOfRange(0, 20_000)
        val top = listOf(OrderByField("date", DESCENDING))
        // a later date on a high id jumps to the front; a deleted low id disappears
        index.apply(listOf(IndexRow.of(schema, 4999, mapOf("date" to "2021-01-01"))), listOf(0))
        assertThat(index.select(all, top, null, 0, 3).toList(), equalTo(listOf(4999, 1, 2)))
        assertThat(
            index.select(all, listOf(OrderByField("date", ASCENDING)), null, 0, 3).toList(),
            equalTo(listOf(1, 2, 3)),
        )
        assertThat(index.select(all, top, null, 4997, 5).toList(), equalTo(listOf(4997, 4998)))
        // past the threshold the permutation is rebuilt and the stale set emptied
        val many = (1 until 1100).map { IndexRow.of(schema, 10_000 + it, mapOf("date" to "2019-01-01")) }
        index.apply(many, emptyList())
        assertThat(index.memoryUsage()["sortPermutationStale"], equalTo(heapBytes(RoaringBitmap())))
        assertThat(index.select(all, top, null, 0, 2).toList(), equalTo(listOf(4999, 1)))
        assertThat(
            index.select(all, listOf(OrderByField("date", ASCENDING)), null, 0, 2).toList(),
            equalTo(listOf(10_001, 10_002)),
        )
    }
}
