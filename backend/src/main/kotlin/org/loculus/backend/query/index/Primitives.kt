package org.loculus.backend.query.index

import org.roaringbitmap.ArrayContainer
import org.roaringbitmap.RoaringBitmap
import org.roaringbitmap.RoaringBitmapWriter
import org.roaringbitmap.RunContainer

/**
 * Append-only string dictionary storing values as UTF-8 in one byte pool (~ len + 12 bytes per value instead
 * of ~100 bytes for String + HashMap entry). Codes are dense 0..size-1. Values are never removed (a full
 * reload compacts). Mutated only by the writer (under the index write lock); reads are safe concurrently.
 */
internal class StringDictionary {
    private var pool = ByteArray(1 shl 12)
    private var poolSize = 0
    private var offsets = IntArray(65) // offsets[i]..offsets[i+1] = bytes of code i
    private var hashes = IntArray(64)
    private var table = IntArray(128) // code + 1, 0 = empty; power of two
    var size = 0
        private set

    fun lookup(value: String): Int = find(value.toByteArray(Charsets.UTF_8))

    fun getOrAdd(value: String): Int {
        val bytes = value.toByteArray(Charsets.UTF_8)
        val existing = find(bytes)
        if (existing >= 0) return existing
        return add(bytes)
    }

    fun get(code: Int): String = String(pool, offsets[code], offsets[code + 1] - offsets[code], Charsets.UTF_8)

    /** unsigned byte-wise comparison of the UTF-8 encodings (= code point order, like SILO / C++ std::string) */
    fun compare(a: Int, b: Int): Int {
        if (a == b) return 0
        var i = offsets[a]
        val endA = offsets[a + 1]
        var j = offsets[b]
        val endB = offsets[b + 1]
        while (i < endA && j < endB) {
            val x = pool[i].toInt() and 0xff
            val y = pool[j].toInt() and 0xff
            if (x != y) return x - y
            i++
            j++
        }
        return (endA - offsets[a]) - (endB - offsets[b])
    }

    fun memoryBytes(): Long = pool.size.toLong() + offsets.size * 4L + hashes.size * 4L + table.size * 4L

    private fun hash(bytes: ByteArray): Int {
        var h = -0x7ee3623b
        for (b in bytes) h = (h xor (b.toInt() and 0xff)) * 0x01000193
        return h xor (h ushr 16)
    }

    private fun find(bytes: ByteArray): Int {
        val h = hash(bytes)
        val mask = table.size - 1
        var slot = h and mask
        while (true) {
            val entry = table[slot]
            if (entry == 0) return -1
            val code = entry - 1
            if (hashes[code] == h && equalsBytes(code, bytes)) return code
            slot = (slot + 1) and mask
        }
    }

    private fun equalsBytes(code: Int, bytes: ByteArray): Boolean {
        val start = offsets[code]
        if (offsets[code + 1] - start != bytes.size) return false
        for (k in bytes.indices) if (pool[start + k] != bytes[k]) return false
        return true
    }

    private fun add(bytes: ByteArray): Int {
        val code = size
        if (poolSize + bytes.size > pool.size) {
            pool = pool.copyOf(maxOf(pool.size * 2, poolSize + bytes.size))
        }
        System.arraycopy(bytes, 0, pool, poolSize, bytes.size)
        poolSize += bytes.size
        if (code + 2 > offsets.size) offsets = offsets.copyOf(offsets.size * 2)
        if (code + 1 > hashes.size) hashes = hashes.copyOf(hashes.size * 2)
        offsets[code + 1] = poolSize
        hashes[code] = hash(bytes)
        size = code + 1
        if (size * 2 > table.size) rehash() else insertSlot(code)
        return code
    }

    private fun insertSlot(code: Int) {
        val mask = table.size - 1
        var slot = hashes[code] and mask
        while (table[slot] != 0) slot = (slot + 1) and mask
        table[slot] = code + 1
    }

    private fun rehash() {
        table = IntArray(table.size * 2)
        for (c in 0 until size) insertSlot(c)
    }
}

/**
 * Dictionary codes per entry id with adaptive width (byte / short / int), storing code + 1 (0 = null).
 */
internal class CodeArray(capacity: Int) {
    private var bytes: ByteArray? = ByteArray(capacity)
    private var shorts: ShortArray? = null
    private var ints: IntArray? = null
    var capacity = capacity
        private set

    /** dictionary code or -1 for null */
    fun get(id: Int): Int {
        if (id >= capacity) return -1
        val b = bytes
        if (b != null) return (b[id].toInt() and 0xff) - 1
        val s = shorts
        if (s != null) return (s[id].toInt() and 0xffff) - 1
        return ints!![id] - 1
    }

    fun set(id: Int, code: Int) {
        val stored = code + 1
        if (bytes != null && stored > 0xff) upgradeToShort()
        if (shorts != null && stored > 0xffff) upgradeToInt()
        bytes?.let {
            it[id] = stored.toByte()
            return
        }
        shorts?.let {
            it[id] = stored.toShort()
            return
        }
        ints!![id] = stored
    }

    fun grow(newCapacity: Int) {
        if (newCapacity <= capacity) return
        bytes = bytes?.copyOf(newCapacity)
        shorts = shorts?.copyOf(newCapacity)
        ints = ints?.copyOf(newCapacity)
        capacity = newCapacity
    }

    fun memoryBytes(): Long = (bytes?.size ?: 0).toLong() + (shorts?.size ?: 0) * 2L + (ints?.size ?: 0) * 4L

    private fun upgradeToShort() {
        val b = bytes!!
        shorts = ShortArray(capacity) { (b[it].toInt() and 0xff).toShort() }
        bytes = null
    }

    private fun upgradeToInt() {
        val s = shorts!!
        ints = IntArray(capacity) { s[it].toInt() and 0xffff }
        shorts = null
    }
}

/** open-addressing long -> int map (no boxing); returns -1 for absent keys */
internal class LongIntMap(expected: Int = 16) {
    private var keys = LongArray(tableSize(expected))
    private var vals = IntArray(keys.size)
    private var used = BooleanArray(keys.size)
    var size = 0
        private set

    fun get(key: Long): Int {
        val mask = keys.size - 1
        var slot = mix(key) and mask
        while (used[slot]) {
            if (keys[slot] == key) return vals[slot]
            slot = (slot + 1) and mask
        }
        return -1
    }

    /** value for [key], inserting [newValue] if absent */
    fun getOrPut(key: Long, newValue: Int): Int {
        val mask = keys.size - 1
        var slot = mix(key) and mask
        while (used[slot]) {
            if (keys[slot] == key) return vals[slot]
            slot = (slot + 1) and mask
        }
        used[slot] = true
        keys[slot] = key
        vals[slot] = newValue
        size++
        if (size * 2 > keys.size) grow()
        return newValue
    }

    private fun grow() {
        val oldKeys = keys
        val oldVals = vals
        val oldUsed = used
        keys = LongArray(oldKeys.size * 2)
        vals = IntArray(keys.size)
        used = BooleanArray(keys.size)
        val mask = keys.size - 1
        for (i in oldKeys.indices) {
            if (!oldUsed[i]) continue
            var slot = mix(oldKeys[i]) and mask
            while (used[slot]) slot = (slot + 1) and mask
            used[slot] = true
            keys[slot] = oldKeys[i]
            vals[slot] = oldVals[i]
        }
    }

    companion object {
        private fun tableSize(expected: Int): Int {
            var n = 16
            while (n < expected * 2) n = n shl 1
            return n
        }

        private fun mix(key: Long): Int {
            var h = key * -0x61c8864680b583ebL
            h = h xor (h ushr 29)
            return h.toInt()
        }
    }
}

/** growable primitive long list */
internal class LongArrayList {
    private var values = LongArray(16)
    var size = 0
        private set

    fun add(value: Long) {
        if (size == values.size) values = values.copyOf(size * 2)
        values[size++] = value
    }

    operator fun get(index: Int): Long = values[index]
}

internal const val BATCH = 256

/** ids of [domain] satisfying [predicate], in id order */
internal inline fun scan(domain: RoaringBitmap, predicate: (Int) -> Boolean): RoaringBitmap {
    val writer = RoaringBitmapWriter.writer().get()
    val iterator = domain.batchIterator
    val buffer = IntArray(BATCH)
    while (iterator.hasNext()) {
        val n = iterator.nextBatch(buffer)
        for (i in 0 until n) {
            val id = buffer[i]
            if (predicate(id)) writer.add(id)
        }
    }
    return writer.get()
}

internal inline fun forEachId(ids: RoaringBitmap, action: (Int) -> Unit) {
    val iterator = ids.batchIterator
    val buffer = IntArray(BATCH)
    while (iterator.hasNext()) {
        val n = iterator.nextBatch(buffer)
        for (i in 0 until n) action(buffer[i])
    }
}

internal fun unionOf(bitmaps: List<RoaringBitmap>): RoaringBitmap = when (bitmaps.size) {
    0 -> RoaringBitmap()
    1 -> bitmaps[0].clone()
    2 -> RoaringBitmap.or(bitmaps[0], bitmaps[1])
    else -> org.roaringbitmap.FastAggregation.or(bitmaps.iterator())
}

internal const val MAX_RUNS_PER_CONTAINER = 64

/**
 * [bitmap] run-optimised, but keeping run containers only where they have few runs: intersecting a run
 * container with many runs (RunContainer.andCardinality / advanceUntil) is several times slower than with an
 * array or bitmap container, and the mutation endpoints intersect hundreds of thousands of bitmaps.
 * Returns a bitmap that owns its containers (the argument must not be used afterwards).
 */
internal fun runOptimizeFewRuns(bitmap: RoaringBitmap): RoaringBitmap {
    val optimized = bitmap.clone()
    if (!optimized.runOptimize()) {
        bitmap.trim()
        return bitmap
    }
    val result = RoaringBitmap()
    val original = bitmap.containerPointer
    val candidate = optimized.containerPointer
    while (candidate.container != null) {
        val c = candidate.container
        val useRun = c !is RunContainer || c.numberOfRuns() <= MAX_RUNS_PER_CONTAINER
        result.append(candidate.key(), if (useRun) c else original.container)
        candidate.advance()
        original.advance()
    }
    result.trim()
    return result
}

/**
 * A read-only copy of [bitmap] for intersecting it with very many (mostly tiny) bitmaps: run containers with
 * many runs and array containers with more than [ARRAY_TO_BITMAP] values become bitmap containers, so every
 * intersection costs O(size of the other container) bit tests (at most 1024 words) instead of merges/gallops.
 */
internal fun forIntersections(bitmap: RoaringBitmap): RoaringBitmap {
    val result = RoaringBitmap()
    val p = bitmap.containerPointer
    while (p.container != null) {
        val c = p.container
        val convert = (c is RunContainer && c.numberOfRuns() > MAX_RUNS_PER_CONTAINER) ||
            (c is ArrayContainer && c.cardinality > ARRAY_TO_BITMAP)
        result.append(p.key(), if (convert) c.toBitmapContainer() else c.clone())
        p.advance()
    }
    return result
}

internal const val ARRAY_TO_BITMAP = 1024
