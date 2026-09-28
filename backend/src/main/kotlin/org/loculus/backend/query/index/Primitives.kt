package org.loculus.backend.query.index

import org.roaringbitmap.ArrayContainer
import org.roaringbitmap.BitmapContainer
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
        if (poolSize.toLong() + bytes.size > pool.size) {
            pool = pool.copyOf(grownArraySize(pool.size, poolSize.toLong() + bytes.size))
        }
        System.arraycopy(bytes, 0, pool, poolSize, bytes.size)
        poolSize += bytes.size
        if (code + 2 > offsets.size) offsets = offsets.copyOf(grownArraySize(offsets.size, code + 2L))
        if (code + 1 > hashes.size) hashes = hashes.copyOf(grownArraySize(hashes.size, code + 1L))
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

/** the largest array the JVM reliably allocates */
internal const val MAX_ARRAY_SIZE = Int.MAX_VALUE - 8

/**
 * The size to grow an array of [current] elements to so that it holds [needed]: doubled, but at most
 * [MAX_ARRAY_SIZE] (doubling past 1 Gi elements overflows Int, and growing by exactly [needed] then copies the
 * whole array on every append).
 */
internal fun grownArraySize(current: Int, needed: Long): Int {
    require(needed <= MAX_ARRAY_SIZE) { "Cannot grow an array beyond $MAX_ARRAY_SIZE elements (need $needed)" }
    return maxOf(needed, minOf(current * 2L, MAX_ARRAY_SIZE.toLong())).toInt()
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

/**
 * Open-addressing long -> int map without boxing: keys and values interleaved in one array (one cache line per
 * probe), key stored as key + 1 with 0 = empty slot (the key -1 is kept separately). Returns -1 for absent keys.
 */
internal class LongIntMap(expected: Int = 16) {
    private var table = LongArray(2 * tableSize(expected))
    private var mask = table.size / 2 - 1
    var size = 0
        private set
    private var minusOneValue = -1

    fun get(key: Long): Int {
        if (key == -1L) return minusOneValue
        val stored = key + 1
        var slot = mix(key) and mask
        while (true) {
            val k = table[2 * slot]
            if (k == 0L) return -1
            if (k == stored) return table[2 * slot + 1].toInt()
            slot = (slot + 1) and mask
        }
    }

    /** sets the value of [key] */
    fun put(key: Long, value: Int) {
        if (key == -1L) {
            if (minusOneValue < 0) size++
            minusOneValue = value
            return
        }
        val stored = key + 1
        var slot = mix(key) and mask
        while (true) {
            val k = table[2 * slot]
            if (k == stored) {
                table[2 * slot + 1] = value.toLong()
                return
            }
            if (k == 0L) break
            slot = (slot + 1) and mask
        }
        table[2 * slot] = stored
        table[2 * slot + 1] = value.toLong()
        size++
        if (size * 2 > mask + 1) grow()
    }

    /** value for [key], inserting [newValue] if absent */
    fun getOrPut(key: Long, newValue: Int): Int {
        if (key == -1L) {
            if (minusOneValue < 0) {
                minusOneValue = newValue
                size++
            }
            return minusOneValue
        }
        val stored = key + 1
        var slot = mix(key) and mask
        while (true) {
            val k = table[2 * slot]
            if (k == stored) return table[2 * slot + 1].toInt()
            if (k == 0L) break
            slot = (slot + 1) and mask
        }
        table[2 * slot] = stored
        table[2 * slot + 1] = newValue.toLong()
        size++
        if (size * 2 > mask + 1) grow()
        return newValue
    }

    private fun grow() {
        val old = table
        table = LongArray(old.size * 2)
        mask = table.size / 2 - 1
        for (i in 0 until old.size / 2) {
            val k = old[2 * i]
            if (k == 0L) continue
            var slot = mix(k - 1) and mask
            while (table[2 * slot] != 0L) slot = (slot + 1) and mask
            table[2 * slot] = k
            table[2 * slot + 1] = old[2 * i + 1]
        }
    }

    companion object {
        private fun tableSize(expected: Int): Int {
            var n = 16
            while (n < expected * 2) n = n shl 1
            return n
        }

        private fun mix(key: Long): Int {
            val h = key * -0x61c8864680b583ebL
            return (h xor (h ushr 32)).toInt()
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

/** shared pool for parallel scans, aggregations, mutation counting and update preparation */
internal val indexPool: java.util.concurrent.ForkJoinPool =
    java.util.concurrent.ForkJoinPool(Runtime.getRuntime().availableProcessors())

/** domains at least this large are processed in parallel, one task per 65536-id chunk */
internal const val PARALLEL_MIN = 100_000

/** ids of [domain] satisfying [predicate], in id order (in parallel per 65536-id chunk for large domains) */
internal inline fun scan(domain: RoaringBitmap, crossinline predicate: (Int) -> Boolean): RoaringBitmap {
    if (domain.cardinality >= PARALLEL_MIN) {
        val parts = mapChunks(domain) { start, end ->
            val writer = RoaringBitmapWriter.writer().get()
            forEachIdIn(domain, start, end) { if (predicate(it)) writer.add(it) }
            writer.get()
        }
        return concatChunks(parts)
    }
    val writer = RoaringBitmapWriter.writer().get()
    forEachId(domain) { if (predicate(it)) writer.add(it) }
    return writer.get()
}

/** [start, end) id ranges of the 65536-id chunks (roaring containers) of [ids] */
internal fun chunkRanges(ids: RoaringBitmap): List<IntArray> {
    val ranges = ArrayList<IntArray>()
    val pointer = ids.containerPointer
    while (pointer.container != null) {
        val start = pointer.key().code shl 16
        ranges.add(intArrayOf(start, start + 65536))
        pointer.advance()
    }
    return ranges
}

/** [task] for every chunk of [ids], in parallel; results in chunk (= id) order */
internal fun <T> mapChunks(ids: RoaringBitmap, task: (start: Int, end: Int) -> T): List<T> {
    val ranges = chunkRanges(ids)
    if (ranges.size <= 1) return ranges.map { task(it[0], it[1]) }
    return indexPool.submit<List<T>> {
        ranges.parallelStream().map { task(it[0], it[1]) }.toList()
    }.get()
}

/** ids of [ids] in [start, end) (end may overflow to negative for the last chunk: treated as unbounded) */
internal inline fun forEachIdIn(ids: RoaringBitmap, start: Int, end: Int, action: (Int) -> Unit) {
    val iterator = ids.batchIterator
    iterator.advanceIfNeeded(start)
    val buffer = IntArray(BATCH)
    val unbounded = end < start
    while (iterator.hasNext()) {
        val n = iterator.nextBatch(buffer)
        for (i in 0 until n) {
            val id = buffer[i]
            if (!unbounded && id >= end) return
            action(id)
        }
    }
}

/** concatenates bitmaps whose ids lie in increasing, disjoint chunks */
internal fun concatChunks(parts: List<RoaringBitmap>): RoaringBitmap {
    val result = RoaringBitmap()
    for (part in parts) {
        val pointer = part.containerPointer
        while (pointer.container != null) {
            result.append(pointer.key(), pointer.container)
            pointer.advance()
        }
    }
    return result
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

/**
 * Run containers with more runs are stored as array or bitmap containers. Measured on PPX data (investigation
 * 29): caps of 64 / 256 / 1024 / unlimited give 306 / 297 / 264 / 263 MB of index for mpox, dengue, cchf and
 * west-nile, with no measurable change in filter, mutations-endpoint or apply() latency. Roaring only keeps a run
 * container while it is smaller than the 8 KB bitmap container (< 2048 runs), so 1024 keeps nearly all of the
 * saving and still bounds the containers that intersections walk run by run.
 */
internal const val MAX_RUNS_PER_CONTAINER = 1024

/**
 * [bitmap] run-optimised, keeping run containers only up to [MAX_RUNS_PER_CONTAINER] runs.
 * Returns a bitmap that owns its containers (the argument must not be used afterwards).
 */
internal fun runOptimizeFewRuns(bitmap: RoaringBitmap): RoaringBitmap {
    val optimized = bitmap.clone()
    if (!optimized.runOptimize() && !bitmap.hasRunCompression()) {
        bitmap.trim()
        return bitmap
    }
    val result = RoaringBitmap()
    val original = bitmap.containerPointer
    val candidate = optimized.containerPointer
    while (candidate.container != null) {
        val c = candidate.container
        val key = candidate.key()
        result.append(
            key,
            when {
                c !is RunContainer || c.numberOfRuns() <= MAX_RUNS_PER_CONTAINER -> c

                // a run container that updates grew past the cap stays one through runOptimize: re-encode it
                original.container is RunContainer -> withoutRuns(key, c)

                else -> original.container
            },
        )
        candidate.advance()
        original.advance()
    }
    result.trim()
    return result
}

/** the values of [c] (a container of chunk [key]) as an array or bitmap container */
private fun withoutRuns(key: Char, c: RunContainer): org.roaringbitmap.Container {
    val writer = RoaringBitmapWriter.writer().runCompress(false).get()
    val base = key.code shl 16
    val iterator = c.getCharIterator()
    while (iterator.hasNext()) writer.add(base or iterator.next().code)
    return writer.get().containerPointer.container
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
        val convert = (c is RunContainer && c.numberOfRuns() > INTERSECT_MAX_RUNS) ||
            (c is ArrayContainer && c.cardinality > ARRAY_TO_BITMAP)
        result.append(p.key(), if (convert) c.toBitmapContainer() else c.clone())
        p.advance()
    }
    return result
}

internal const val ARRAY_TO_BITMAP = 1024

/** [forIntersections] turns run containers with more runs into bitmap containers */
internal const val INTERSECT_MAX_RUNS = 64

/**
 * Approximate heap bytes of [bitmap] (compressed oops, compact object headers as in production).
 * `getLongSizeInBytes()` is the serialized size: it leaves out the ~130 B of objects every bitmap carries
 * (RoaringBitmap, RoaringArray, its key and container arrays, a container object and its array) and the unused
 * capacity of arrays grown by `add`, which is read from the arrays themselves.
 */
internal fun heapBytes(bitmap: RoaringBitmap): Long {
    var containers = 0
    var total = 0L
    val pointer = bitmap.containerPointer
    while (pointer.container != null) {
        val c = pointer.container
        total += CONTAINER_OBJECT_BYTES + when (c) {
            is ArrayContainer -> arrayBytes(2L * (RoaringInternals.capacity(c) ?: maxOf(4, c.cardinality)))
            is BitmapContainer -> arrayBytes(8L * 1024)
            is RunContainer -> arrayBytes(2L * (RoaringInternals.capacity(c) ?: (2 * maxOf(4, c.numberOfRuns()))))
            else -> arrayBytes(c.getSizeInBytes().toLong())
        }
        containers++
        pointer.advance()
    }
    val slots = (RoaringInternals.slots(bitmap) ?: maxOf(4, containers)).toLong()
    return total + BITMAP_OBJECTS_BYTES + arrayBytes(2 * slots) + arrayBytes(4 * slots)
}

/** array lengths inside RoaringBitmap (package-private fields); null where reflection is not permitted */
private object RoaringInternals {
    private fun field(owner: Class<*>, name: String) = runCatching {
        owner.getDeclaredField(name).also { it.isAccessible = true }
    }.getOrNull()

    private val highLowContainer = field(RoaringBitmap::class.java, "highLowContainer")
    private val keys = field(org.roaringbitmap.RoaringArray::class.java, "keys")
    private val arrayContent = field(ArrayContainer::class.java, "content")
    private val runValues = field(RunContainer::class.java, "valueslength")

    fun slots(bitmap: RoaringBitmap): Int? = runCatching {
        (keys!!.get(highLowContainer!!.get(bitmap)) as CharArray).size
    }.getOrNull()

    fun capacity(c: ArrayContainer): Int? = runCatching { (arrayContent!!.get(c) as CharArray).size }.getOrNull()

    fun capacity(c: RunContainer): Int? = runCatching { (runValues!!.get(c) as CharArray).size }.getOrNull()
}

/** heap bytes of a primitive or reference array with [payload] bytes of elements */
internal fun arrayBytes(payload: Long): Long = (ARRAY_HEADER_BYTES + payload + 7) and 7L.inv()

private const val ARRAY_HEADER_BYTES = 12L
private const val BITMAP_OBJECTS_BYTES = 16L + 24L
private const val CONTAINER_OBJECT_BYTES = 16L

/**
 * Entry ids per dictionary code, for columns looked up by value (accessionVersion, accession): O(k) point and
 * in-list filters without a bitmap per value. [heads] holds, per code, 0 (no id), id + 1 (one id) or
 * -(slot + 1) for codes with several ids, whose ids are `lists[slot][1..count]` (count in element 0, unordered).
 * Mutated only by the index writer.
 */
internal class IdPostings {
    private var heads = IntArray(64)
    private var lists = arrayOfNulls<IntArray>(16)
    private var listCount = 0
    private var freeSlots = IntArray(16)
    private var freeCount = 0

    fun add(code: Int, id: Int) {
        if (code >= heads.size) heads = heads.copyOf(maxOf(code + 1, heads.size * 3 / 2))
        val head = heads[code]
        when {
            head == 0 -> heads[code] = id + 1

            head > 0 -> {
                val slot = newSlot()
                lists[slot] = intArrayOf(2, head - 1, id, 0)
                heads[code] = -(slot + 1)
            }

            else -> {
                val slot = -head - 1
                var list = lists[slot]!!
                val count = list[0]
                if (count + 1 >= list.size) list = list.copyOf(list.size * 2).also { lists[slot] = it }
                list[count + 1] = id
                list[0] = count + 1
            }
        }
    }

    fun remove(code: Int, id: Int) {
        if (code >= heads.size) return
        val head = heads[code]
        when {
            head == id + 1 -> heads[code] = 0

            head < 0 -> {
                val slot = -head - 1
                val list = lists[slot]!!
                val count = list[0]
                for (i in 1..count) {
                    if (list[i] != id) continue
                    list[i] = list[count]
                    list[0] = count - 1
                    break
                }
                if (list[0] == 1) {
                    heads[code] = list[1] + 1
                    lists[slot] = null
                    if (freeCount == freeSlots.size) freeSlots = freeSlots.copyOf(freeCount * 2)
                    freeSlots[freeCount++] = slot
                }
            }
        }
    }

    /** sorted, distinct ids of [codes] */
    fun ids(codes: IntArray): RoaringBitmap {
        var ids = IntArray(maxOf(16, codes.size))
        var n = 0
        for (code in codes) {
            if (code < 0 || code >= heads.size) continue
            val head = heads[code]
            if (head == 0) continue
            val list = if (head < 0) lists[-head - 1]!! else null
            val count = list?.get(0) ?: 1
            if (n + count > ids.size) ids = ids.copyOf(maxOf(n + count, ids.size * 2))
            if (list == null) {
                ids[n++] = head - 1
            } else {
                System.arraycopy(list, 1, ids, n, count)
                n += count
            }
        }
        java.util.Arrays.sort(ids, 0, n)
        val writer = RoaringBitmapWriter.writer().get()
        for (i in 0 until n) if (i == 0 || ids[i] != ids[i - 1]) writer.add(ids[i])
        return writer.get()
    }

    fun memoryBytes(): Long {
        var total = arrayBytes(4L * heads.size) + arrayBytes(4L * lists.size) + arrayBytes(4L * freeSlots.size)
        for (i in 0 until listCount) lists[i]?.let { total += arrayBytes(4L * it.size) }
        return total
    }

    private fun newSlot(): Int {
        if (freeCount > 0) return freeSlots[--freeCount]
        if (listCount == lists.size) lists = lists.copyOf(listCount * 2)
        return listCount++
    }
}
