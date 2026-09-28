package org.loculus.backend.query.index

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.roaringbitmap.RoaringBitmap
import org.roaringbitmap.RunContainer
import kotlin.random.Random

class PrimitivesTest {
    @Test
    fun `LongIntMap behaves like a HashMap including special keys`() {
        val map = LongIntMap()
        val reference = HashMap<Long, Int>()
        val random = Random(3)
        val special = listOf(-1L, 0L, Long.MIN_VALUE, Long.MAX_VALUE, -2L)
        repeat(20_000) {
            val key = if (random.nextInt(10) == 0) special.random(random) else random.nextLong(-5000, 5000)
            val value = random.nextInt(1_000_000)
            assertThat(map.getOrPut(key, value), equalTo(reference.getOrPut(key) { value }))
        }
        assertThat(map.size, equalTo(reference.size))
        reference.forEach { (k, v) -> assertThat(map.get(k), equalTo(v)) }
        assertThat(map.get(123_456_789L), equalTo(-1))
    }

    @Test
    fun `runOptimizeFewRuns re-encodes run containers that grew past the cap`() {
        val bitmap = RoaringBitmap()
        for (run in 0 until MAX_RUNS_PER_CONTAINER + 100) bitmap.add((run * 10).toLong(), (run * 10 + 3).toLong())
        bitmap.add(70_000L, 70_010L)
        bitmap.runOptimize()
        assertThat(bitmap.containerPointer.container is RunContainer, equalTo(true))
        val expected = bitmap.toArray().toList()
        val result = runOptimizeFewRuns(bitmap.clone())
        assertThat(result.toArray().toList(), equalTo(expected))
        val pointer = result.containerPointer
        assertThat(pointer.container is RunContainer, equalTo(false))
        pointer.advance()
        assertThat(pointer.container is RunContainer, equalTo(true))
    }

    @Test
    fun `array growth doubles, stops at the largest array instead of overflowing, and fails past it`() {
        assertThat(grownArraySize(4096, 4097), equalTo(8192))
        assertThat(grownArraySize(4096, 10_000), equalTo(10_000))
        // doubling 1.25 Gi overflowed Int; growing by exactly the needed size then copied the pool on every add
        val big = 1_342_177_280
        assertThat(grownArraySize(big, big + 10L), equalTo(MAX_ARRAY_SIZE))
        assertThat(grownArraySize(MAX_ARRAY_SIZE - 100, MAX_ARRAY_SIZE.toLong()), equalTo(MAX_ARRAY_SIZE))
        val error = runCatching { grownArraySize(MAX_ARRAY_SIZE, MAX_ARRAY_SIZE + 1L) }.exceptionOrNull()
        assertThat(error is IllegalArgumentException, equalTo(true))
    }

    @Test
    fun `StringDictionary keeps codes and values across growth`() {
        val dictionary = StringDictionary()
        val values = (0 until 5000).map { "value-$it-" + "x".repeat(it % 50) }
        values.forEachIndexed { i, v -> assertThat(dictionary.getOrAdd(v), equalTo(i)) }
        values.forEachIndexed { i, v ->
            assertThat(dictionary.lookup(v), equalTo(i))
            assertThat(dictionary.get(i), equalTo(v))
        }
        assertThat(dictionary.getOrAdd(values[1234]), equalTo(1234))
        assertThat(dictionary.size, equalTo(5000))
    }
}
