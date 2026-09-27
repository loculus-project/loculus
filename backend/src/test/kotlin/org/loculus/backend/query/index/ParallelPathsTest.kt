package org.loculus.backend.query.index

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.loculus.backend.query.filter.And
import org.loculus.backend.query.filter.DateBetween
import org.loculus.backend.query.filter.IntBetween
import org.loculus.backend.query.filter.IsNull
import org.loculus.backend.query.filter.Not
import org.loculus.backend.query.filter.StringEquals
import org.loculus.backend.query.filter.True
import java.time.LocalDate
import kotlin.random.Random

/** large domains (> PARALLEL_MIN ids, several 65536-id chunks) take the parallel scan / aggregation paths */
class ParallelPathsTest {
    private val schema = IndexTestSupport.schema()
    private val random = Random(7)
    private val n = 300_000
    private val country = Array(n) { if (random.nextInt(20) == 0) null else "C${random.nextInt(60)}" }
    private val date = IntArray(n) { if (random.nextInt(15) == 0) Int.MIN_VALUE else 18000 + random.nextInt(900) }
    private val age = IntArray(n) { if (random.nextInt(10) == 0) Int.MIN_VALUE else random.nextInt(100) }

    // ids with gaps so that chunks are not all full
    private val ids = IntArray(n) { it + it / 3 }

    private val index = InMemoryOrganismIndex.build(
        schema,
        (0 until n).map { i ->
            IndexRow.of(
                schema,
                ids[i],
                mapOf(
                    "country" to country[i],
                    "date" to date[i].takeIf { it != Int.MIN_VALUE },
                    "age" to age[i].takeIf { it != Int.MIN_VALUE },
                ),
            )
        },
    )

    private fun brute(predicate: (Int) -> Boolean) = (0 until n).filter(predicate).map { ids[it] }

    @Test
    fun `parallel scans equal brute force`() {
        assertThat(
            index.evaluate(DateBetween("date", 18100, 18500)).toArray().toList(),
            equalTo(brute { date[it] in 18100..18500 }),
        )
        assertThat(
            index.evaluate(IntBetween("age", 10, 20)).toArray().toList(),
            equalTo(brute { age[it] in 10..20 }),
        )
        assertThat(index.evaluate(IsNull("age")).toArray().toList(), equalTo(brute { age[it] == Int.MIN_VALUE }))
        assertThat(
            index.evaluate(And(listOf(Not(StringEquals("country", "C1")), DateBetween("date", null, 18300))))
                .toArray().toList(),
            equalTo(brute { country[it] != "C1" && date[it] != Int.MIN_VALUE && date[it] <= 18300 }),
        )
    }

    private fun bruteAggregate(rows: List<Int>, key: (Int) -> List<Any?>): List<AggregatedRow> {
        val counts = LinkedHashMap<List<Any?>, Long>()
        rows.forEach { counts.merge(key(it), 1L, Long::plus) }
        return counts.map { (k, v) -> AggregatedRow(k, v) }
    }

    private fun day(d: Int): String? = if (d == Int.MIN_VALUE) null else LocalDate.ofEpochDay(d.toLong()).toString()

    private fun ageValue(a: Int): Long? = if (a == Int.MIN_VALUE) null else a.toLong()

    @Test
    fun `parallel aggregations equal brute force in first seen order`() {
        val all = index.evaluate(True)
        val everything = (0 until n).toList()
        assertThat(index.aggregate(all, listOf("country")), equalTo(bruteAggregate(everything) { listOf(country[it]) }))
        assertThat(index.aggregate(all, listOf("date")), equalTo(bruteAggregate(everything) { listOf(day(date[it])) }))
        assertThat(
            index.aggregate(all, listOf("country", "age")),
            equalTo(bruteAggregate(everything) { listOf(country[it], ageValue(age[it])) }),
        )
        val subset = index.evaluate(DateBetween("date", 18000, 18700))
        val subsetRows = (0 until n).filter { date[it] in 18000..18700 }
        assertThat(
            index.aggregate(subset, listOf("age", "date", "country")),
            equalTo(bruteAggregate(subsetRows) { listOf(ageValue(age[it]), day(date[it]), country[it]) }),
        )
    }
}
