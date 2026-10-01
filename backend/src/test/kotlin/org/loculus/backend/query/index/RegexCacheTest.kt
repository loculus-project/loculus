package org.loculus.backend.query.index

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.lessThanOrEqualTo
import org.junit.jupiter.api.Test
import org.loculus.backend.query.schema.FieldType
import org.loculus.backend.query.schema.MetadataField
import org.roaringbitmap.RoaringBitmap
import kotlin.random.Random

class RegexCacheTest {
    private val random = Random(17)

    private fun value() = (1..random.nextInt(1, 6)).map { "abcxyz"[random.nextInt(6)] }.joinToString("")

    @Test
    fun `regex results stay exact while the shared cache evicts by bytes and the dictionaries grow`() {
        // a budget of ~4 results of this size: every query below evicts or re-evaluates something
        val cache = RegexCache(budgetBytes = 4 * arrayBytes(8L * 64), maxEntries = 100)
        val columns = List(2) { StringColumn(MetadataField("f$it", FieldType.STRING), 10_000, regexCache = cache) }
        val values = List(2) { HashMap<Int, String?>() }
        val patterns = listOf("a", "^b", "c$", "x.z", "^$", "(?i)Y", "zz", "a|b", "^[abc]+$", "b.*a")
        var nextId = 0
        repeat(40) { round ->
            // grow the dictionaries across several 64-code words
            repeat(60) {
                val id = nextId++
                for ((c, column) in columns.withIndex()) {
                    val v = if (random.nextInt(10) == 0) null else value() + round
                    column.set(id, v)
                    values[c][id] = v
                }
            }
            val domain = RoaringBitmap.bitmapOf(*(0 until nextId).toList().toIntArray())
            repeat(15) {
                val c = random.nextInt(2)
                val pattern = patterns[random.nextInt(patterns.size)]
                val regex = Regex(pattern)
                val expected = values[c].filter { (_, v) -> regex.containsMatchIn(v ?: "") }.keys.sorted()
                val actual = columns[c].regexFilter(pattern, domain).toArray().toList()
                assertThat("$pattern on f$c", actual, equalTo(expected))
                assertThat(cache.bytes, lessThanOrEqualTo(4 * arrayBytes(8L * 64)))
            }
        }
    }

    @Test
    fun `least recently used results go first, and results larger than the budget are not kept`() {
        val column = StringColumn(MetadataField("f", FieldType.STRING), 1000)
        repeat(100) { column.set(it, "v$it") }
        val one = arrayBytes(8L * 2)
        val cache = RegexCache(budgetBytes = 3 * one, maxEntries = 10)
        cache.matches(column, "1", column.dictionary)
        cache.matches(column, "2", column.dictionary)
        cache.matches(column, "3", column.dictionary)
        assertThat(cache.size, equalTo(3))
        cache.matches(column, "1", column.dictionary) // most recent now: "2" is the eldest
        cache.matches(column, "4", column.dictionary)
        assertThat(cache.size, equalTo(3))
        assertThat(cache.bytes, equalTo(3 * one))
        val before = cache.bytes
        cache.matches(column, "2", column.dictionary) // evicted: evaluated again, evicts "3"
        assertThat(cache.bytes, equalTo(before))

        val tiny = RegexCache(budgetBytes = one - 1, maxEntries = 10)
        val snapshot = tiny.matches(column, "7", column.dictionary)
        assertThat((0 until 100).filter { snapshot.matches(it) }, equalTo((0 until 100).filter { '7' in "v$it" }))
        assertThat(tiny.size, equalTo(0))
        assertThat(tiny.bytes, equalTo(0L))

        val counted = RegexCache(budgetBytes = 1L shl 20, maxEntries = 2)
        for (p in listOf("1", "2", "3")) counted.matches(column, p, column.dictionary)
        assertThat(counted.size, equalTo(2))
    }
}
