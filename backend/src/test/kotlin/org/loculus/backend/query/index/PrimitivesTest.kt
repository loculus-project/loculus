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
        for (run in 0 until 200) bitmap.add((run * 10).toLong(), (run * 10 + 3).toLong())
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
}
