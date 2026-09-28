package org.loculus.backend.query.cache

/**
 * Count-min sketch of how often a key was seen (TinyLFU-style admission): [DEPTH] rows of 4-bit counters (capped at
 * 15). After [resetAfter] increments every counter is halved, so old popularity decays.
 * Thread-safe by a monitor: an increment costs a few array writes.
 */
class FrequencySketch(countersPerRow: Int, private val resetAfter: Long = countersPerRow * 10L) {
    private val width = Integer.highestOneBit(countersPerRow.coerceAtLeast(64))
    private val mask = width - 1
    private val counters = ByteArray(width * DEPTH)
    private var increments = 0L

    /** records one sighting of [key] and returns its estimated count including this one */
    @Synchronized
    fun increment(key: String): Int {
        val h = hashes(key)
        var min = Int.MAX_VALUE
        for (row in 0 until DEPTH) {
            val i = row * width + (h[row] and mask)
            if (counters[i] < MAX) counters[i]++
            min = minOf(min, counters[i].toInt())
        }
        if (++increments >= resetAfter) halve()
        return min
    }

    @Synchronized
    fun estimate(key: String): Int {
        val h = hashes(key)
        var min = Int.MAX_VALUE
        for (row in 0 until DEPTH) min = minOf(min, counters[row * width + (h[row] and mask)].toInt())
        return min
    }

    private fun halve() {
        for (i in counters.indices) counters[i] = (counters[i].toInt() ushr 1).toByte()
        increments = 0
    }

    private fun hashes(key: String): IntArray {
        // two independent 32-bit hashes, combined (Kirsch-Mitzenmacher)
        val a = spread(key.hashCode())
        val b = spread(a xor 0x5bd1e995 xor key.length)
        return IntArray(DEPTH) { a + it * b }
    }

    private fun spread(x: Int): Int {
        var h = x
        h = h xor (h ushr 16)
        h *= -0x7a143595
        h = h xor (h ushr 13)
        h *= -0x3d4d51cb
        return h xor (h ushr 16)
    }

    private companion object {
        const val DEPTH = 4
        const val MAX: Byte = 15
    }
}
