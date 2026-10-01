package org.loculus.backend.query.index

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThan
import org.junit.jupiter.api.Test
import org.loculus.backend.query.filter.And
import org.loculus.backend.query.filter.Filter
import org.loculus.backend.query.filter.IntBetween
import org.loculus.backend.query.filter.IsNull
import org.loculus.backend.query.filter.Not
import org.loculus.backend.query.filter.Or
import org.loculus.backend.query.filter.StringEquals
import org.loculus.backend.query.filter.StringRegex
import org.loculus.backend.query.schema.FieldType
import org.loculus.backend.query.schema.MetadataField
import org.roaringbitmap.RoaringBitmap
import kotlin.random.Random

/**
 * String columns come in three kinds: per-value bitmaps (generateIndex), value -> ids postings (accessionVersion,
 * accession) and plain codes that filters scan. The same values stored in all three must give the same results.
 */
class NearUniqueColumnsTest {
    private val schema = IndexTestSupport.schema(
        metadata = listOf(
            MetadataField("accessionVersion", FieldType.STRING),
            MetadataField("accession", FieldType.STRING),
            MetadataField("indexed", FieldType.STRING, generateIndex = true),
            MetadataField("plain", FieldType.STRING),
            MetadataField("version", FieldType.INT),
        ),
    )
    private val stringFields = listOf("accession", "indexed", "plain")

    private fun ids(bitmap: RoaringBitmap) = bitmap.toArray().toList()

    private fun row(id: Int, accessionVersion: String?, tag: String?, version: Int = 1) = IndexRow.of(
        schema,
        id,
        mapOf(
            "accessionVersion" to accessionVersion,
            "accession" to tag,
            "indexed" to tag,
            "plain" to tag,
            "version" to version,
        ),
    )

    @Test
    fun `the three column kinds agree on equality, in-lists, nulls, regex and aggregates, also after updates`() {
        val random = Random(42)
        val pool = listOf(null, "", "Alpha", "alpha", "Beta", "Gamma.1", "Gamma.10", "Ä", "x|y") +
            (0 until 40).map { "v$it" }
        val live = HashMap<Int, String?>()

        fun randomRow(id: Int): IndexRow {
            val tag = pool[random.nextInt(pool.size)]
            live[id] = tag
            return row(id, "AV$id.${random.nextInt(3)}", tag, random.nextInt(5))
        }
        // ids on both sides of the 65536-id chunk boundary
        val initialIds = (0 until 1500).map { if (it % 2 == 0) it else 65_000 + it }
        val index = InMemoryOrganismIndex.build(schema, initialIds.map { randomRow(it) })

        fun check() {
            fun expected(pred: (String?) -> Boolean) = live.filterValues(pred).keys.sorted()
            for (field in stringFields) {
                for (value in pool) {
                    assertThat(
                        "$field=$value",
                        ids(index.evaluate(StringEquals(field, value))),
                        equalTo(
                            expected {
                                it ==
                                    value
                            },
                        ),
                    )
                }
                val list = listOf("Alpha", null, "v3", "missing", "v3", "")
                assertThat(
                    "$field in $list",
                    ids(index.evaluate(Or(list.map { StringEquals(field, it) }))),
                    equalTo(expected { it in list }),
                )
                assertThat(ids(index.evaluate(IsNull(field))), equalTo(expected { it == null }))
                assertThat(
                    ids(index.evaluate(Not(Or(listOf(StringEquals(field, "Beta"), StringEquals(field, null)))))),
                    equalTo(expected { it != "Beta" && it != null }),
                )
                for (pattern in listOf("^Gamma\\.1$", "(?i)alpha", "^$", "v1", "Ä", "x\\|y")) {
                    val regex = com.google.re2j.Pattern.compile(pattern)
                    assertThat(
                        "$field.regex $pattern",
                        ids(index.evaluate(StringRegex(field, pattern))),
                        equalTo(expected { regex.matcher(it ?: "").find() }),
                    )
                }
                // mixed Or: the equality part is merged, the rest evaluated as before
                val mixed =
                    Or(listOf(StringEquals(field, "Alpha"), IntBetween("version", 4, 4), StringEquals(field, "v7")))
                val versions = index.evaluate(IntBetween("version", 4, 4))
                assertThat(
                    ids(index.evaluate(mixed)),
                    equalTo((expected { it == "Alpha" || it == "v7" } + ids(versions)).distinct().sorted()),
                )
                // a narrowed domain (scans only visit the ids an And leaves)
                val narrowed =
                    And(
                        listOf(
                            IntBetween("version", 1, 2),
                            Or(listOf(StringEquals(field, "v1"), StringEquals(field, "v2"))),
                        ),
                    )
                val inRange = ids(index.evaluate(IntBetween("version", 1, 2))).toSet()
                assertThat(
                    ids(index.evaluate(narrowed)),
                    equalTo(
                        expected { it == "v1" || it == "v2" }.filter {
                            it in
                                inRange
                        },
                    ),
                )
                val counts = index.aggregate(index.evaluate(org.loculus.backend.query.filter.True), listOf(field))
                    .associate { it.values[0] to it.count }
                assertThat(counts, equalTo(live.values.groupingBy { it }.eachCount().mapValues { it.value.toLong() }))
            }
        }
        check()
        repeat(5) {
            val ids = live.keys.toList()
            val deleted = ids.shuffled(random).take(100)
            deleted.forEach { live.remove(it) }
            val upserts = ids.filter { it !in deleted }.shuffled(random).take(150).map { randomRow(it) } +
                (0 until 50).map { randomRow(70_000 + it * 3 + random.nextInt(3) + 1000 * (live.size % 7)) }
            index.apply(upserts, deleted)
            check()
        }
    }

    @Test
    fun `accession lookups stay direct past 65536 versions`() {
        val n = 70_000
        // accession i has versions at ids i and (for i < 10000) 60000 + i
        val rows = (0 until n).map { id ->
            val (accession, version) = if (id < 60_000) id to 1 else (id - 60_000) to 2
            row(id, "PP_$accession.$version", "PP_$accession", version)
        }
        val index = InMemoryOrganismIndex.build(schema, rows)
        assertThat(ids(index.evaluate(StringEquals("accessionVersion", "PP_5535.2"))), equalTo(listOf(65_535)))
        assertThat(ids(index.evaluate(StringEquals("accessionVersion", "PP_59999.1"))), equalTo(listOf(59_999)))
        assertThat(ids(index.evaluate(StringEquals("accessionVersion", "PP_9999.2"))), equalTo(listOf(69_999)))
        assertThat(ids(index.evaluate(StringEquals("accession", "PP_5"))), equalTo(listOf(5, 60_005)))
        assertThat(ids(index.evaluate(StringEquals("accession", "PP_59999"))), equalTo(listOf(59_999)))
        assertThat(ids(index.evaluate(StringEquals("accession", "PP_60000"))), empty())

        val list = (0 until 20_000).map { "PP_${it * 3}" } + "unknown"
        val expected = (0 until 20_000).flatMap { a ->
            listOfNotNull(a * 3, (60_000 + a * 3).takeIf { a * 3 < 10_000 })
        }
        assertThat(ids(index.evaluate(Or(list.map { StringEquals("accession", it) }))), equalTo(expected.sorted()))
        val versions = (0 until n step 7).map { rows[it].values[0] as String }
        assertThat(
            ids(index.evaluate(Or(versions.map { StringEquals("accessionVersion", it) }))),
            equalTo((0 until n step 7).toList()),
        )
        // with a scanned filter next to it (the website's versionStatus default), the list still decides first
        val withScan =
            And(listOf(StringEquals("plain", "PP_5"), Or(listOf("PP_5", "PP_6").map { StringEquals("accession", it) })))
        assertThat(ids(index.evaluate(withScan)), equalTo(listOf(5, 60_005)))
        // the plain column scans and the indexed one fell back to scanning past the limit: same results
        for (field in listOf("indexed", "plain")) {
            assertThat(ids(index.evaluate(StringEquals(field, "PP_5"))), equalTo(listOf(5, 60_005)))
        }
    }

    @Test
    fun `revising, revoking and deleting keep accession lookups exact`() {
        val index = InMemoryOrganismIndex.build(
            schema,
            listOf(row(0, "A.1", "A"), row(1, "B.1", "B"), row(2, "C.1", "C")),
        )
        // revise A: version 2 gets a new id; the old version's row is re-upserted (versionStatus changes)
        index.apply(listOf(row(0, "A.1", "A"), row(3, "A.2", "A", 2)), emptyList())
        assertThat(ids(index.evaluate(StringEquals("accession", "A"))), equalTo(listOf(0, 3)))
        assertThat(ids(index.evaluate(StringEquals("accessionVersion", "A.1"))), equalTo(listOf(0)))
        assertThat(ids(index.evaluate(StringEquals("accessionVersion", "A.2"))), equalTo(listOf(3)))
        // revoke B: a revocation version
        index.apply(listOf(row(1, "B.1", "B"), row(4, "B.2", "B", 2)), emptyList())
        assertThat(ids(index.evaluate(StringEquals("accession", "B"))), equalTo(listOf(1, 4)))
        // a third version, then deleting versions one by one
        index.apply(listOf(row(5, "A.3", "A", 3)), emptyList())
        assertThat(ids(index.evaluate(StringEquals("accession", "A"))), equalTo(listOf(0, 3, 5)))
        index.apply(emptyList(), listOf(3))
        assertThat(ids(index.evaluate(StringEquals("accession", "A"))), equalTo(listOf(0, 5)))
        assertThat(ids(index.evaluate(StringEquals("accessionVersion", "A.2"))), empty())
        index.apply(emptyList(), listOf(0, 5))
        assertThat(ids(index.evaluate(StringEquals("accession", "A"))), empty())
        // an id whose value changes no longer answers to the old value
        index.apply(listOf(row(2, "D.1", "D")), emptyList())
        assertThat(ids(index.evaluate(StringEquals("accessionVersion", "C.1"))), empty())
        assertThat(ids(index.evaluate(StringEquals("accession", "D"))), equalTo(listOf(2)))
        assertThat(
            ids(index.evaluate(Or(listOf("A", "B", "C", "D").map { StringEquals("accession", it) }))),
            containsInAnyOrder(1, 2, 4),
        )
    }

    @Test
    fun `id postings collapse and reuse multi-id slots`() {
        val postings = IdPostings()
        postings.add(3, 10)
        postings.add(3, 11)
        postings.add(3, 12)
        postings.add(1000, 5)
        assertThat(ids(postings.ids(intArrayOf(3, 1000, 7, -1, 3))), equalTo(listOf(5, 10, 11, 12)))
        postings.remove(3, 11)
        postings.remove(3, 10)
        assertThat(ids(postings.ids(intArrayOf(3))), equalTo(listOf(12)))
        postings.add(4, 1)
        postings.add(4, 2)
        postings.remove(4, 99)
        assertThat(ids(postings.ids(intArrayOf(4))), equalTo(listOf(1, 2)))
        postings.remove(3, 12)
        assertThat(ids(postings.ids(intArrayOf(3))), empty())
    }

    @Test
    fun `heap estimate of a small bitmap includes its object overhead`() {
        val bitmap = RoaringBitmap.bitmapOf(7)
        assertThat(heapBytes(bitmap), greaterThan(100L))
        assertThat(heapBytes(bitmap), greaterThan(4 * bitmap.getLongSizeInBytes()))
    }
}
