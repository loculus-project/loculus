package org.loculus.backend.query.index

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.lessThan
import org.junit.jupiter.api.Test
import org.loculus.backend.query.filter.And
import org.loculus.backend.query.filter.Filter
import org.loculus.backend.query.filter.IntBetween
import org.loculus.backend.query.filter.IsNull
import org.loculus.backend.query.filter.Not
import org.loculus.backend.query.filter.Or
import org.loculus.backend.query.filter.StringEquals
import org.loculus.backend.query.filter.StringRegex
import org.loculus.backend.query.filter.True
import org.loculus.backend.query.request.OrderByField
import org.loculus.backend.query.request.OrderDirection.ASCENDING
import org.loculus.backend.query.request.OrderDirection.DESCENDING
import org.loculus.backend.query.schema.FieldType
import org.loculus.backend.query.schema.MetadataField
import org.loculus.backend.query.schema.QuerySchema
import org.roaringbitmap.RoaringBitmap
import kotlin.random.Random

/**
 * accessionVersion derived from accession + version answers every filter, sort and grouping exactly like the
 * stored column it replaces. The reference index has the same rows but no `accession` field (the column is then
 * stored), so both are compared on the same requests.
 */
class DerivedAccessionVersionTest {
    private fun metadata(accessionName: String) = listOf(
        MetadataField("accessionVersion", FieldType.STRING),
        MetadataField(accessionName, FieldType.STRING),
        MetadataField("version", FieldType.INT),
        MetadataField("country", FieldType.STRING, generateIndex = true),
    )

    private val derivedSchema: QuerySchema = IndexTestSupport.schema(metadata = metadata("accession"))
    private val storedSchema: QuerySchema = IndexTestSupport.schema(metadata = metadata("acc"))

    private class Entry(val accession: String?, val version: Any?, val accessionVersion: String?, val country: String)

    private fun rows(schema: QuerySchema, entries: Map<Int, Entry>) = entries.map { (id, e) ->
        val accessionName = schema.metadata[1].name
        IndexRow.of(
            schema,
            id,
            mapOf(
                "accessionVersion" to e.accessionVersion,
                accessionName to e.accession,
                "version" to e.version,
                "country" to e.country,
            ),
        )
    }

    private class Scenario(
        val accessions: List<String?>,
        val versions: List<Any?>,
        /** probability that the stored value is not accession.version */
        val exceptionRate: Double,
    )

    private fun entry(random: Random, s: Scenario): Entry {
        val accession = s.accessions[random.nextInt(s.accessions.size)]
        val version = s.versions[random.nextInt(s.versions.size)]
        val versionNumber = AccessionVersionColumn.versionValue(version)
        val derived = if (accession == null || versionNumber == null) null else "$accession.$versionNumber"
        val stored = if (random.nextDouble() < s.exceptionRate) {
            listOf(null, "odd", "A.01", "B.2", "A.1", "x.y.3", "")[random.nextInt(7)]
        } else {
            derived
        }
        return Entry(accession, version, stored, listOf("CH", "DE", "FR")[random.nextInt(3)])
    }

    private fun ids(bitmap: RoaringBitmap) = bitmap.toArray().toList()

    private fun compare(
        derived: InMemoryOrganismIndex,
        stored: InMemoryOrganismIndex,
        random: Random,
        values: List<String?>,
    ) {
        val probes = values + listOf(
            "A", "A.", ".1", "A.01", "A.+1", "A. 1", "A.1 ", "A.1.0", "A.x", "", ".", "A..1", "A.-0",
            "A.99999999999999999999", "A.9223372036854775807", "A.-1", "a.b.1", "missing.1",
        )
        val filters = ArrayList<Filter>()
        probes.forEach { filters.add(StringEquals("accessionVersion", it)) }
        filters.add(IsNull("accessionVersion"))
        filters.add(Or(probes.map { StringEquals("accessionVersion", it) }))
        filters.add(Or(probes.shuffled(random).take(7).map { StringEquals("accessionVersion", it) }))
        filters.add(
            Not(Or(listOf(StringEquals("accessionVersion", values.first()), StringEquals("accessionVersion", null)))),
        )
        filters.add(
            And(
                listOf(
                    IntBetween("version", 2, 3),
                    Or(
                        probes.take(10).map {
                            StringEquals("accessionVersion", it)
                        },
                    ),
                ),
            ),
        )
        filters.add(Or(listOf(StringEquals("accessionVersion", probes[1]), StringEquals("country", "CH"))))
        for (pattern in listOf("^A\\.1$", "\\.1", "(?i)a", "^$", "1$", "A-", "^[AB]\\.[0-9]+$", "Ä")) {
            filters.add(StringRegex("accessionVersion", pattern))
        }
        for (filter in filters) {
            assertThat("$filter", ids(derived.evaluate(filter)), equalTo(ids(stored.evaluate(filter))))
        }
        val all = stored.evaluate(True)
        val subset = RoaringBitmap().also { bm -> all.forEach { id: Int -> if (random.nextInt(3) == 0) bm.add(id) } }
        for (ids in listOf(all, subset)) {
            for (order in listOf(
                listOf(OrderByField("accessionVersion", ASCENDING)),
                listOf(OrderByField("accessionVersion", DESCENDING)),
                listOf(OrderByField("country", ASCENDING), OrderByField("accessionVersion", DESCENDING)),
            )) {
                for ((offset, limit) in listOf(0 to 10, 0 to null, 5 to 3, ids.cardinality / 2 to 20)) {
                    assertThat(
                        "$order $offset $limit",
                        derived.select(ids, order, null, offset, limit).toList(),
                        equalTo(stored.select(ids, order, null, offset, limit).toList()),
                    )
                }
            }
            for (fields in listOf(listOf("accessionVersion"), listOf("country", "accessionVersion"))) {
                assertThat("$fields", derived.aggregate(ids, fields), equalTo(stored.aggregate(ids, fields)))
            }
            ids.forEach { id: Int ->
                assertThat(derived.value(id, "accessionVersion"), equalTo(stored.value(id, "accessionVersion")))
            }
        }
    }

    private fun check(scenario: Scenario, seed: Int, expectExceptions: Boolean) {
        val random = Random(seed)
        val entries = HashMap<Int, Entry>()
        (0 until 800).forEach { entries[it * 3] = entry(random, scenario) }
        val derived = InMemoryOrganismIndex.build(derivedSchema, rows(derivedSchema, entries))
        val stored = InMemoryOrganismIndex.build(storedSchema, rows(storedSchema, entries))
        fun values() = entries.values.map { it.accessionVersion }.distinct().take(40)
        compare(derived, stored, random, values())
        repeat(4) {
            val existing = entries.keys.toList()
            val deleted = existing.shuffled(random).take(60)
            deleted.forEach { entries.remove(it) }
            // revisions and changed versions of existing ids, and new ids
            val upserts = (
                existing.filter { it !in deleted }.shuffled(random).take(80) +
                    (0 until 30).map { 5000 + it * 7 + random.nextInt(7) }
                )
                .distinct().associateWith { entry(random, scenario) }
            entries.putAll(upserts)
            derived.apply(rows(derivedSchema, upserts), deleted)
            stored.apply(rows(storedSchema, upserts), deleted)
            compare(derived, stored, random, values())
        }
        assertThat(derived.accessionVersionExceptions() > 0, equalTo(expectExceptions))
    }

    private val loculusAccessions = (0 until 300).map { "LOC_%06d".format(it) + "ABCDEFGHJK"[it % 10] }

    @Test
    fun `Loculus-like data (the fast paths) matches the stored column`() {
        val versions = listOf<Any?>(1, 1, 1, 2, 3, 10, 11, 2L, "4")
        check(Scenario(loculusAccessions, versions, 0.0), seed = 1, expectExceptions = false)
    }

    @Test
    fun `accessions with characters sorting before the dot, nulls and missing versions match the stored column`() {
        val accessions = listOf(null, "A", "A1", "A-", "A+B", "AB", "a.b", "a", "Ä", "", "A B", "B")
        val versions = listOf<Any?>(null, 1, 2, 10, 20, 100, "7", "x", 3.0)
        check(Scenario(accessions, versions, 0.0), seed = 2, expectExceptions = false)
    }

    @Test
    fun `negative and long versions match the stored column`() {
        val versions = listOf<Any?>(1, -1, -10, 0, 3_000_000_000L, Int.MAX_VALUE, Int.MIN_VALUE, 12)
        check(Scenario(listOf("A", "B", "A1"), versions, 0.0), seed = 3, expectExceptions = false)
    }

    @Test
    fun `large versions (sparse group keys) match the stored column`() {
        val versions = listOf<Any?>(1, 2, 5_000_000, 99_999_999, Int.MAX_VALUE)
        check(Scenario(loculusAccessions, versions, 0.0), seed = 6, expectExceptions = false)
    }

    @Test
    fun `parse and version keys agree with printing the number`() {
        val random = Random(7)
        val numbers = listOf(0L, 1, 9, 10, 11, 99, 100, 101, 1_000_000_000, Int.MAX_VALUE.toLong()) +
            (0 until 2000).map { random.nextLong(0, Int.MAX_VALUE.toLong() + 1) / (1L shl random.nextInt(31)) }
        for (v in numbers) {
            assertThat(AccessionVersionColumn.parse("A.$v"), equalTo("A" to v))
            assertThat(AccessionVersionColumn.parse("A.-$v"), equalTo(if (v == 0L) null else "A" to -v))
        }
        val sorted = numbers.distinct().sortedBy { it.toString() }
        assertThat(numbers.distinct().sortedBy { AccessionVersionColumn.versionKey(it) }, equalTo(sorted))
        val malformed = listOf(
            "A", "A.", ".", "A.01", "A.+1", "A. 1", "A.1 ", "A.-0", "A.-", "A.1e3", "A.99999999999999999999", "A.١",
        )
        for (bad in malformed) {
            assertThat(bad, AccessionVersionColumn.parse(bad), equalTo(null))
        }
        assertThat(AccessionVersionColumn.parse("a.b.12"), equalTo("a.b" to 12L))
        assertThat(AccessionVersionColumn.parse(".3"), equalTo("" to 3L))
        assertThat(AccessionVersionColumn.parse("A.9223372036854775807"), equalTo("A" to Long.MAX_VALUE))
    }

    @Test
    fun `stored values other than accession dot version are kept exactly`() {
        check(
            Scenario(listOf("A", "B", "C", null), listOf<Any?>(1, 2, 10, null), 0.3),
            seed = 4,
            expectExceptions = true,
        )
    }

    @Test
    fun `the derived column stores nothing per entry`() {
        val entries = (0 until 20_000).associateWith {
            val accession = "LOC_%06d".format(it / 2)
            val version = 1 + it % 2
            Entry(accession, version, "$accession.$version", "CH")
        }
        val derived = InMemoryOrganismIndex.build(derivedSchema, rows(derivedSchema, entries))
        val stored = InMemoryOrganismIndex.build(storedSchema, rows(storedSchema, entries))
        val derivedBytes = derived.memoryUsage().getValue("metadata:accessionVersion")
        // an empty exception dictionary and bitmap
        assertThat(derivedBytes, lessThan(10_000L))
        assertThat(
            stored.memoryUsage().getValue("metadata:accessionVersion"),
            org.hamcrest.Matchers.greaterThan(400_000L),
        )
        assertThat(
            derived.evaluate(StringEquals("accessionVersion", "LOC_000123.2")).toArray().toList(),
            equalTo(listOf(247)),
        )
    }
}
