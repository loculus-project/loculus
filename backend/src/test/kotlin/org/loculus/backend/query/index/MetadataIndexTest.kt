package org.loculus.backend.query.index

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test
import org.loculus.backend.query.filter.And
import org.loculus.backend.query.filter.BooleanEquals
import org.loculus.backend.query.filter.DateBetween
import org.loculus.backend.query.filter.Filter
import org.loculus.backend.query.filter.FloatBetween
import org.loculus.backend.query.filter.FloatEquals
import org.loculus.backend.query.filter.IntBetween
import org.loculus.backend.query.filter.IntEquals
import org.loculus.backend.query.filter.IsNull
import org.loculus.backend.query.filter.LineageIn
import org.loculus.backend.query.filter.Not
import org.loculus.backend.query.filter.Or
import org.loculus.backend.query.filter.StringEquals
import org.loculus.backend.query.filter.StringRegex
import org.loculus.backend.query.filter.True
import org.loculus.backend.query.request.OrderByField
import org.loculus.backend.query.request.OrderDirection.ASCENDING
import org.loculus.backend.query.request.OrderDirection.DESCENDING
import org.loculus.backend.query.request.RandomOrder
import org.roaringbitmap.RoaringBitmap
import java.time.LocalDate
import kotlin.random.Random

class MetadataIndexTest {
    private val schema = IndexTestSupport.schema()

    private val data = listOf(
        // id, accessionVersion, country, lineage, age, score, date, isRevocation
        listOf(0, "A.1", "Switzerland", "B.1.1.7", 30, 1.5, "2021-01-01", false),
        listOf(1, "B.1", "Germany", "B.1.1.7", null, 0.5, "2021-01-05", false),
        listOf(2, "C.1", null, "BA.1", 25, null, null, true),
        listOf(3, "D.1", "Switzerland", null, 40, -2.0, "2020-12-31", null),
        listOf(4, "E.1", "", "BA.1.1", 30, 1.5, "2021-02-01", false),
        listOf(5, "F.1", "Germany", "BA.1", 18, 3.0, "2021-01-05", true),
        listOf(7, "Ä.1", "Zambia", "B.1", 30, 2.5, "2021-01-02", false),
    )

    private val index = InMemoryOrganismIndex.build(
        schema,
        data.map { r ->
            IndexRow.of(
                schema,
                r[0] as Int,
                schema.metadata.map { it.name }.zip(r.drop(1)).toMap(),
            )
        },
    )

    private fun ids(filter: Filter) = index.evaluate(filter).toArray().toList()

    private fun day(s: String) = LocalDate.parse(s).toEpochDay().toInt()

    @Test
    fun `string equality and nulls`() {
        assertThat(ids(StringEquals("country", "Switzerland")), contains(0, 3))
        assertThat(ids(StringEquals("country", "")), contains(4))
        assertThat(ids(StringEquals("country", null)), contains(2))
        assertThat(ids(StringEquals("country", "switzerland")), equalTo(emptyList()))
        assertThat(ids(IsNull("country")), contains(2))
        assertThat(ids(Not(IsNull("country"))), contains(0, 1, 3, 4, 5, 7))
        assertThat(ids(Or(listOf(StringEquals("country", "Zambia"), StringEquals("country", null)))), contains(2, 7))
    }

    @Test
    fun `regex is a partial match and matches nulls as empty string`() {
        assertThat(ids(StringRegex("country", "land")), contains(0, 3))
        assertThat(ids(StringRegex("country", "^$")), contains(2, 4))
        assertThat(ids(StringRegex("country", ".*")), contains(0, 1, 2, 3, 4, 5, 7))
        assertThat(ids(StringRegex("country", "^G")), contains(1, 5))
        assertThat(ids(StringRegex("lineage", "^BA\\.1")), contains(2, 4, 5))
        assertThat(ids(StringRegex("country", "S")), contains(0, 3))
    }

    @Test
    fun `lineage in set`() {
        assertThat(ids(LineageIn("lineage", setOf("BA.1", "BA.1.1", "unknown"))), contains(2, 4, 5))
        assertThat(ids(LineageIn("lineage", null)), contains(3))
    }

    @Test
    fun `numeric, date and boolean filters`() {
        assertThat(ids(IntEquals("age", 30)), contains(0, 4, 7))
        assertThat(ids(IntEquals("age", null)), contains(1))
        assertThat(ids(IntBetween("age", 25, 30)), contains(0, 2, 4, 7))
        assertThat(ids(IntBetween("age", null, 20)), contains(5))
        assertThat(ids(FloatEquals("score", 1.5)), contains(0, 4))
        assertThat(ids(FloatBetween("score", -5.0, 1.0)), contains(1, 3))
        assertThat(ids(FloatEquals("score", null)), contains(2))
        assertThat(ids(DateBetween("date", day("2021-01-01"), day("2021-01-05"))), contains(0, 1, 5, 7))
        assertThat(ids(DateBetween("date", day("2021-01-05"), day("2021-01-05"))), contains(1, 5))
        assertThat(ids(DateBetween("date", null, day("2020-12-31"))), contains(3))
        assertThat(ids(IsNull("date")), contains(2))
        assertThat(ids(BooleanEquals("isRevocation", true)), contains(2, 5))
        assertThat(ids(BooleanEquals("isRevocation", false)), contains(0, 1, 4, 7))
        assertThat(ids(BooleanEquals("isRevocation", null)), contains(3))
        assertThat(
            ids(And(listOf(IntBetween("age", 20, 35), Not(StringEquals("country", "Zambia")), True))),
            contains(0, 2, 4),
        )
    }

    @Test
    fun `aggregate groups in first seen order with typed values`() {
        val all = index.evaluate(True)
        assertThat(
            index.aggregate(all, listOf("country")),
            contains(
                AggregatedRow(listOf("Switzerland"), 2),
                AggregatedRow(listOf("Germany"), 2),
                AggregatedRow(listOf(null), 1),
                AggregatedRow(listOf(""), 1),
                AggregatedRow(listOf("Zambia"), 1),
            ),
        )
        assertThat(index.aggregate(all, emptyList()), contains(AggregatedRow(emptyList(), 7)))
        assertThat(index.aggregate(RoaringBitmap(), emptyList()), contains(AggregatedRow(emptyList(), 0)))
        assertThat(index.aggregate(RoaringBitmap(), listOf("country")), equalTo(emptyList()))
        assertThat(
            index.aggregate(all, listOf("age", "isRevocation")),
            contains(
                AggregatedRow(listOf(30L, false), 3),
                AggregatedRow(listOf(null, false), 1),
                AggregatedRow(listOf(25L, true), 1),
                AggregatedRow(listOf(40L, null), 1),
                AggregatedRow(listOf(18L, true), 1),
            ),
        )
        assertThat(
            index.aggregate(index.evaluate(StringEquals("country", "Germany")), listOf("date", "score")),
            contains(AggregatedRow(listOf("2021-01-05", 0.5), 1), AggregatedRow(listOf("2021-01-05", 3.0), 1)),
        )
        assertThat(
            index.aggregate(index.evaluate(IntEquals("age", 30)), listOf("date.isoWeek")),
            contains(AggregatedRow(listOf("2020-W53"), 2), AggregatedRow(listOf("2021-W05"), 1)),
        )
    }

    private fun select(
        orderBy: List<OrderByField>,
        offset: Int = 0,
        limit: Int? = null,
        random: RandomOrder? = null,
        ids: RoaringBitmap = index.evaluate(True),
    ) = index.select(ids, orderBy, random, offset, limit).toList()

    @Test
    fun `select ordering with nulls smallest, offset and limit`() {
        assertThat(select(emptyList()), contains(0, 1, 2, 3, 4, 5, 7))
        assertThat(select(emptyList(), offset = 2, limit = 3), contains(2, 3, 4))
        assertThat(select(listOf(OrderByField("country", ASCENDING))), contains(2, 4, 1, 5, 0, 3, 7))
        assertThat(select(listOf(OrderByField("country", DESCENDING))), contains(7, 0, 3, 1, 5, 4, 2))
        assertThat(
            select(listOf(OrderByField("age", DESCENDING), OrderByField("date", ASCENDING))),
            contains(3, 0, 7, 4, 2, 5, 1),
        )
        assertThat(select(listOf(OrderByField("age", ASCENDING)), offset = 1, limit = 2), contains(5, 2))
        // UTF-8 byte order: 'Ä' (C3 84) sorts after ASCII
        assertThat(select(listOf(OrderByField("accessionVersion", DESCENDING)), limit = 2), contains(7, 5))
        assertThat(select(listOf(OrderByField("score", ASCENDING))), contains(2, 3, 1, 0, 4, 7, 5))
        assertThat(select(listOf(OrderByField("isRevocation", ASCENDING))), contains(3, 0, 1, 4, 7, 2, 5))
        assertThat(select(listOf(OrderByField("country", ASCENDING)), offset = 10), equalTo(emptyList()))
    }

    @Test
    fun `random order is seeded, applied after offset and before limit`() {
        val a = select(emptyList(), random = RandomOrder(7))
        val b = select(emptyList(), random = RandomOrder(7))
        assertThat(a, equalTo(b))
        assertThat(a.sorted(), contains(0, 1, 2, 3, 4, 5, 7))
        val withOffset = select(listOf(OrderByField("age", ASCENDING)), offset = 3, random = RandomOrder(3))
        // after offset 3 in age order (1, 5, 2, | 0, 4, 7, 3): the remaining rows, shuffled
        assertThat(withOffset.sorted(), contains(0, 3, 4, 7))
        assertThat(select(emptyList(), random = RandomOrder(1), limit = 3).size, equalTo(3))
    }

    @Test
    fun `top-k selection equals full sort`() {
        val schema = IndexTestSupport.schema()
        val random = Random(1)
        val rows = (0 until 5000).map { id ->
            IndexRow.of(
                schema,
                id,
                mapOf(
                    "country" to listOf("A", "B", "C", null)[random.nextInt(4)],
                    "age" to if (random.nextInt(10) == 0) null else random.nextInt(50),
                    "accessionVersion" to "X${random.nextInt(100000)}",
                ),
            )
        }
        val big = InMemoryOrganismIndex.build(schema, rows)
        val all = big.evaluate(True)
        for (orderBy in listOf(
            listOf(OrderByField("age", ASCENDING)),
            listOf(OrderByField("age", DESCENDING)),
            listOf(OrderByField("country", DESCENDING), OrderByField("age", ASCENDING)),
            listOf(OrderByField("accessionVersion", ASCENDING)),
        )) {
            val full = big.select(all, orderBy, null, 0, null).toList()
            assertThat(full.size, equalTo(5000))
            for ((offset, limit) in listOf(0 to 10, 17 to 100, 0 to 1, 400 to 50)) {
                assertThat(
                    "$orderBy $offset $limit",
                    big.select(all, orderBy, null, offset, limit).toList(),
                    equalTo(full.drop(offset).take(limit)),
                )
            }
            // stability: ties keep id order
            val keys = full.map { big.value(it, orderBy[0].field) }
            for (i in 1 until full.size) {
                if (keys[i] == keys[i - 1] && orderBy.size == 1) assertThat(full[i] > full[i - 1], equalTo(true))
            }
        }
    }

    @Test
    fun `the content token changes with every applied batch, even within one dataVersion, and per instance`() {
        val schema = IndexTestSupport.schema()
        val rows = (0 until 3).map { IndexRow.of(schema, it, mapOf("country" to "C$it")) }
        val idx = InMemoryOrganismIndex.build(schema, rows, dataVersion = 7)
        val loaded = idx.contentToken
        idx.apply(listOf(IndexRow.of(schema, 1, mapOf("country" to "X"))), emptyList(), dataVersion = 7)
        val updated = idx.contentToken
        idx.apply(emptyList(), listOf(2))
        assertThat(setOf(loaded, updated, idx.contentToken).size, equalTo(3))
        assertThat(idx.dataVersion, equalTo(7L))
        assertThat(InMemoryOrganismIndex.build(schema, rows, dataVersion = 7).contentToken, not(equalTo(loaded)))
    }

    @Test
    fun `updates replace metadata and value bitmaps`() {
        val schema = IndexTestSupport.schema()
        val idx = InMemoryOrganismIndex.build(
            schema,
            (0 until 10).map { IndexRow.of(schema, it, mapOf("country" to "C${it % 3}", "age" to it)) },
        )
        idx.apply(
            listOf(
                IndexRow.of(schema, 1, mapOf("country" to "C0", "age" to 100)),
                IndexRow.of(schema, 20, mapOf("country" to "New")),
            ),
            listOf(0, 3),
            dataVersion = 42,
        )
        assertThat(idx.dataVersion, equalTo(42L))
        assertThat(idx.evaluate(StringEquals("country", "C0")).toArray().toList(), contains(1, 6, 9))
        assertThat(idx.evaluate(StringEquals("country", "New")).toArray().toList(), contains(20))
        assertThat(idx.evaluate(IntEquals("age", 100)).toArray().toList(), contains(1))
        assertThat(idx.evaluate(IsNull("age")).toArray().toList(), contains(20))
        assertThat(idx.value(1, "age"), equalTo(100L))
        assertThat(idx.value(0, "country"), equalTo(null))
        assertThat(idx.size, equalTo(9))
    }
}
