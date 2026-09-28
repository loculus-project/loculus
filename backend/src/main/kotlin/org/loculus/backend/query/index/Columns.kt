package org.loculus.backend.query.index

import com.google.re2j.Pattern
import org.loculus.backend.query.schema.FieldType
import org.loculus.backend.query.schema.MetadataField
import org.roaringbitmap.RoaringBitmap
import java.time.LocalDate
import java.time.temporal.IsoFields
import java.util.concurrent.ConcurrentHashMap

/** a source of grouping keys for /aggregated; [denseRange] > 0 means keys are 0 until denseRange */
internal interface GroupKeySource {
    val denseRange: Int
    fun key(id: Int): Long
    fun decode(key: Long): Any?
}

/**
 * Typed metadata column. Mutated only by the writer under the index write lock; everything else is read-only
 * and may run concurrently (lazily computed caches are published via volatile fields / concurrent maps).
 */
internal sealed class Column(val field: MetadataField) : GroupKeySource {
    abstract fun grow(capacity: Int)

    /** [id] must be cleared (never set or [clear]ed) */
    abstract fun set(id: Int, value: Any?)

    abstract fun clear(id: Int)

    abstract fun isNull(id: Int): Boolean

    /** value as in LAPIS JSON output */
    abstract fun value(id: Int): Any?

    /** order-preserving key, nulls = Long.MIN_VALUE (smallest) */
    abstract fun sortKey(id: Int): Long

    abstract fun memoryBytes(): Long

    override val denseRange: Int get() = -1

    override fun key(id: Int): Long = sortKey(id)

    open fun isNullFilter(domain: RoaringBitmap): RoaringBitmap = scan(domain) { isNull(it) }

    /** compresses the column's bitmaps (bulk load only, before the index is visible) */
    open fun runOptimize() {}

    /** like [SequenceIndex.compactTouched], for the bitmaps writes changed since the last call */
    open fun compactTouched(install: (List<() -> Unit>) -> Unit) {}

    companion object {
        /** [lookupByValue]: keep value -> ids postings instead of per-value bitmaps (string fields only) */
        fun create(field: MetadataField, capacity: Int, lookupByValue: Boolean = false): Column = when (field.type) {
            FieldType.STRING -> StringColumn(field, capacity, lookupByValue)
            FieldType.INT -> IntColumn(field, capacity)
            FieldType.FLOAT -> FloatColumn(field, capacity)
            FieldType.DATE -> DateColumn(field, capacity)
            FieldType.BOOLEAN -> BooleanColumn(field, capacity)
        }
    }
}

/**
 * Dictionary codes per id plus one of three ways to find the ids of a value:
 * - per-value bitmaps, for fields with `generateIndex` or a lineage system (like SILO's indexed dictionary
 *   columns); dropped for good once the dictionary exceeds [BITMAP_LIMIT] values;
 * - [IdPostings] (value -> ids, ~4 B per value), for the accession columns ([lookupByValue]), so point and
 *   in-list filters cost O(k) at any size;
 * - neither: equality, in-list and regex filters scan the codes of the ids in their domain.
 */
internal class StringColumn(field: MetadataField, capacity: Int, lookupByValue: Boolean = false) : Column(field) {
    val dictionary = StringDictionary()
    private val codes = CodeArray(capacity)
    private val nulls = RoaringBitmap()

    private var bitmaps: ArrayList<RoaringBitmap>? =
        if (!lookupByValue && (field.generateIndex || field.lineageSystem != null)) ArrayList() else null
    private val postings: IdPostings? = if (lookupByValue) IdPostings() else null

    /** codes whose value bitmap changed since [compactTouched] (writer only) */
    private val touchedCodes = java.util.BitSet()

    @Volatile private var ranks: Ranks? = null
    private val regexCache = ConcurrentHashMap<String, RegexMatches>()

    val hasBitmaps: Boolean get() = bitmaps != null

    /** equality and in-list filters are answered without scanning */
    val hasValueIndex: Boolean get() = bitmaps != null || postings != null

    override fun grow(capacity: Int) = codes.grow(capacity)

    override fun set(id: Int, value: Any?) {
        if (value == null) {
            nulls.add(id)
            return
        }
        val code = dictionary.getOrAdd(value.toString())
        codes.set(id, code)
        postings?.add(code, id)
        val bm = bitmaps ?: return
        if (dictionary.size > BITMAP_LIMIT) {
            bitmaps = null
            return
        }
        while (bm.size <= code) bm.add(RoaringBitmap())
        bm[code].add(id)
        touchedCodes.set(code)
    }

    override fun runOptimize() {
        bitmaps?.let { list -> for (c in list.indices) list[c] = runOptimizeFewRuns(list[c]) }
        nulls.runOptimize()
        nulls.trim()
        touchedCodes.clear()
    }

    override fun compactTouched(install: (List<() -> Unit>) -> Unit) {
        val list = bitmaps
        if (list != null) {
            val swaps = ArrayList<() -> Unit>()
            var c = touchedCodes.nextSetBit(0)
            while (c >= 0) {
                val code = c
                if (code < list.size) {
                    val o = runOptimizeFewRuns(list[code].clone())
                    swaps.add { list[code] = o }
                }
                if (swaps.size >= 4096) {
                    install(ArrayList(swaps))
                    swaps.clear()
                }
                c = touchedCodes.nextSetBit(c + 1)
            }
            if (swaps.isNotEmpty()) install(swaps)
        }
        touchedCodes.clear()
    }

    override fun clear(id: Int) {
        val code = codes.get(id)
        if (code < 0) {
            nulls.remove(id)
            return
        }
        bitmaps?.let {
            it[code].remove(id)
            touchedCodes.set(code)
        }
        postings?.remove(code, id)
        codes.set(id, -1)
    }

    fun code(id: Int): Int = codes.get(id)

    override fun isNull(id: Int) = codes.get(id) < 0

    override fun value(id: Int): Any? {
        val code = codes.get(id)
        return if (code < 0) null else dictionary.get(code)
    }

    override fun sortKey(id: Int): Long {
        val code = codes.get(id)
        return if (code < 0) Long.MIN_VALUE else ranks().rank[code].toLong()
    }

    override val denseRange: Int get() = dictionary.size + 1

    override fun key(id: Int): Long = (codes.get(id) + 1).toLong()

    override fun decode(key: Long): Any? = if (key == 0L) null else dictionary.get(key.toInt() - 1)

    override fun isNullFilter(domain: RoaringBitmap): RoaringBitmap = nulls.clone()

    fun equalsFilter(value: String, domain: RoaringBitmap): RoaringBitmap {
        val code = dictionary.lookup(value)
        if (code < 0) return RoaringBitmap()
        val bm = bitmaps
        if (bm != null) return if (code < bm.size) bm[code].clone() else RoaringBitmap()
        postings?.let { return it.ids(intArrayOf(code)) }
        return scan(domain) { codes.get(it) == code }
    }

    /** ids whose code is in [codeSet] (plus nulls if [matchNull]); codes < 0 (unknown values) are ignored */
    fun inFilter(codeSet: IntArray, matchNull: Boolean, domain: RoaringBitmap): RoaringBitmap {
        val bm = bitmaps
        if (bm != null) {
            val parts = ArrayList<RoaringBitmap>(codeSet.size + 1)
            for (c in codeSet) if (c in 0 until bm.size) parts.add(bm[c])
            if (matchNull) parts.add(nulls)
            return unionOf(parts)
        }
        postings?.let { p ->
            val ids = p.ids(codeSet)
            if (matchNull) ids.or(nulls)
            return ids
        }
        val lookup = BooleanArray(dictionary.size + 1)
        for (c in codeSet) if (c >= 0) lookup[c + 1] = true
        lookup[0] = matchNull
        return scan(domain) { lookup[codes.get(it) + 1] }
    }

    /** ids equal to one of [values] (null = is null) */
    fun inFilter(values: Collection<String?>, domain: RoaringBitmap): RoaringBitmap {
        var matchNull = false
        val codeSet = IntArray(values.size)
        var n = 0
        for (v in values) {
            if (v == null) matchNull = true else codeSet[n++] = dictionary.lookup(v)
        }
        return inFilter(codeSet.copyOf(n), matchNull, domain)
    }

    fun regexFilter(pattern: String, domain: RoaringBitmap): RoaringBitmap {
        val snapshot = regexMatches(pattern)
        if (bitmaps == null) {
            val mask = snapshot.matches
            val matchNull = snapshot.matchesNull
            return scan(domain) { id ->
                val c = codes.get(id)
                if (c < 0) matchNull else mask[c]
            }
        }
        val matching = ArrayList<Int>()
        for (c in 0 until snapshot.size) if (snapshot.matches[c]) matching.add(c)
        return inFilter(matching.toIntArray(), snapshot.matchesNull, domain)
    }

    /**
     * Regex results per dictionary code. The dictionary is append-only, so a cached result only needs to be
     * extended to new codes.
     */
    private fun regexMatches(pattern: String): RegexMatchesSnapshot {
        if (regexCache.size > MAX_CACHED_REGEXES) regexCache.clear()
        val cached = regexCache.computeIfAbsent(pattern) { RegexMatches(it) }
        return cached.upTo(dictionary)
    }

    fun ranks(): Ranks {
        val current = ranks
        val size = dictionary.size
        if (current != null && current.size == size) return current
        val updated = Ranks.compute(dictionary, current)
        ranks = updated
        return updated
    }

    override fun memoryBytes(): Long {
        var total = codes.memoryBytes() + dictionary.memoryBytes() + heapBytes(nulls)
        bitmaps?.let { list ->
            total += arrayBytes(4L * list.size)
            list.forEach { total += heapBytes(it) }
        }
        postings?.let { total += it.memoryBytes() }
        ranks?.let { total += arrayBytes(4L * it.sorted.size) + arrayBytes(4L * it.rank.size) }
        regexCache.values.forEach { total += it.memoryBytes() }
        return total
    }

    companion object {
        const val BITMAP_LIMIT = 65536
        const val MAX_CACHED_REGEXES = 256
    }
}

internal class RegexMatchesSnapshot(val matches: BooleanArray, val size: Int, val matchesNull: Boolean)

internal class RegexMatches(pattern: String) {
    private val compiled = Pattern.compile(pattern)
    private val literal = LiteralPattern.parse(pattern)
    private val matchesNull = compiled.matcher("").find()
    private var matches = BooleanArray(0)
    private var evaluated = 0

    @Synchronized
    fun upTo(dictionary: StringDictionary): RegexMatchesSnapshot {
        val size = dictionary.size
        if (evaluated < size) {
            if (matches.size < size) matches = matches.copyOf(maxOf(size, matches.size * 2))
            for (c in evaluated until size) {
                val value = dictionary.get(c)
                matches[c] = literal?.foundIn(value) ?: compiled.matcher(value).find()
            }
            evaluated = size
        }
        return RegexMatchesSnapshot(matches, size, matchesNull)
    }

    fun memoryBytes(): Long = arrayBytes(matches.size.toLong())
}

/**
 * A regex that is an ASCII literal, optionally prefixed by `(?i)`, with metacharacters backslash-escaped: what the
 * website's free-text and substring search sends. Evaluated as a substring search instead of RE2J, which is
 * ~8x faster per dictionary value, with RE2's case folding for ASCII (k also matches U+212A KELVIN SIGN, s also
 * matches U+017F LATIN SMALL LETTER LONG S).
 */
internal class LiteralPattern private constructor(private val literal: String, private val ignoreCase: Boolean) {
    fun foundIn(value: String): Boolean {
        if (!ignoreCase) return value.contains(literal)
        val last = value.length - literal.length
        for (start in 0..last) {
            var k = 0
            while (k < literal.length && foldEquals(literal[k], value[start + k])) k++
            if (k == literal.length) return true
        }
        return false
    }

    private fun foldEquals(literalChar: Char, c: Char): Boolean = when {
        c == literalChar -> true
        c.code < 128 -> literalChar.isLetter() && c.lowercaseChar() == literalChar.lowercaseChar()
        c == '\u212A' -> literalChar == 'k' || literalChar == 'K'
        c == '\u017F' -> literalChar == 's' || literalChar == 'S'
        else -> false
    }

    companion object {
        private const val META = "\\.+*?()|[]{}^$"

        fun parse(pattern: String): LiteralPattern? {
            val ignoreCase = pattern.startsWith("(?i)")
            val body = if (ignoreCase) pattern.substring(4) else pattern
            val literal = StringBuilder(body.length)
            var i = 0
            while (i < body.length) {
                var c = body[i]
                if (c == '\\') {
                    if (i + 1 >= body.length || body[i + 1] !in META) return null
                    c = body[++i]
                } else if (c in META) {
                    return null
                }
                if (c.code >= 128 || c.code < 32) return null
                literal.append(c)
                i++
            }
            return LiteralPattern(literal.toString(), ignoreCase)
        }
    }
}

/** sort rank per dictionary code (UTF-8 byte order); maintained incrementally as the dictionary grows */
internal class Ranks(val size: Int, val sorted: IntArray, val rank: IntArray) {
    companion object {
        fun compute(dictionary: StringDictionary, previous: Ranks?): Ranks {
            val size = dictionary.size
            val comparator = Comparator<Int> { a, b -> dictionary.compare(a, b) }
            val start = previous?.size ?: 0
            val added = (start until size).sortedWith(comparator).toIntArray()
            val sorted: IntArray = if (previous == null) {
                added
            } else {
                // insert the (few) new codes into the previous order
                val result = IntArray(size)
                var out = 0
                var from = 0
                val old = previous.sorted
                for (code in added) {
                    var lo = from
                    var hi = old.size
                    while (lo < hi) {
                        val mid = (lo + hi) ushr 1
                        if (dictionary.compare(old[mid], code) <= 0) lo = mid + 1 else hi = mid
                    }
                    System.arraycopy(old, from, result, out, lo - from)
                    out += lo - from
                    from = lo
                    result[out++] = code
                }
                System.arraycopy(old, from, result, out, old.size - from)
                result
            }
            val rank = IntArray(size)
            for (i in sorted.indices) rank[sorted[i]] = i
            return Ranks(size, sorted, rank)
        }
    }
}

internal class IntColumn(field: MetadataField, capacity: Int) : Column(field) {
    private var ints: IntArray? = IntArray(capacity) { INT_NULL }
    private var longs: LongArray? = null

    override fun grow(capacity: Int) {
        ints?.let { old -> ints = old.copyOf(capacity).also { it.fill(INT_NULL, old.size, capacity) } }
        longs?.let { old -> longs = old.copyOf(capacity).also { it.fill(Long.MIN_VALUE, old.size, capacity) } }
    }

    override fun set(id: Int, value: Any?) {
        if (value == null) return
        val v = when (value) {
            is Number -> value.toLong()
            else -> value.toString().toLong()
        }
        val i = ints
        if (i != null) {
            if (v > Int.MIN_VALUE && v <= Int.MAX_VALUE) {
                i[id] = v.toInt()
                return
            }
            longs = LongArray(i.size) { if (i[it] == INT_NULL) Long.MIN_VALUE else i[it].toLong() }
            ints = null
        }
        longs!![id] = v
    }

    override fun clear(id: Int) {
        ints?.let { it[id] = INT_NULL }
        longs?.let { it[id] = Long.MIN_VALUE }
    }

    /** raw value, Long.MIN_VALUE for null */
    fun raw(id: Int): Long {
        val i = ints
        if (i != null) {
            if (id >= i.size) return Long.MIN_VALUE
            val v = i[id]
            return if (v == INT_NULL) Long.MIN_VALUE else v.toLong()
        }
        val l = longs!!
        return if (id >= l.size) Long.MIN_VALUE else l[id]
    }

    override fun isNull(id: Int) = raw(id) == Long.MIN_VALUE

    override fun value(id: Int): Any? = raw(id).takeIf { it != Long.MIN_VALUE }

    override fun sortKey(id: Int) = raw(id)

    override fun decode(key: Long): Any? = key.takeIf { it != Long.MIN_VALUE }

    fun filter(from: Long, to: Long, domain: RoaringBitmap): RoaringBitmap {
        val i = ints
        if (i != null) {
            val lo = maxOf(from, Int.MIN_VALUE + 1L)
            val hi = minOf(to, Int.MAX_VALUE.toLong())
            if (lo > hi) return RoaringBitmap()
            val loI = lo.toInt()
            val hiI = hi.toInt()
            return scan(domain) { id -> id < i.size && i[id].let { it != INT_NULL && it >= loI && it <= hiI } }
        }
        val l = longs!!
        return scan(domain) { id -> id < l.size && l[id].let { it != Long.MIN_VALUE && it >= from && it <= to } }
    }

    override fun memoryBytes(): Long = (ints?.size ?: 0) * 4L + (longs?.size ?: 0) * 8L

    companion object {
        const val INT_NULL = Int.MIN_VALUE
    }
}

internal class FloatColumn(field: MetadataField, capacity: Int) : Column(field) {
    private var values = DoubleArray(capacity) { Double.NaN }

    override fun grow(capacity: Int) {
        val old = values
        values = old.copyOf(capacity).also { it.fill(Double.NaN, old.size, capacity) }
    }

    override fun set(id: Int, value: Any?) {
        if (value == null) return
        values[id] = when (value) {
            is Number -> value.toDouble()
            else -> value.toString().toDouble()
        }
    }

    override fun clear(id: Int) {
        values[id] = Double.NaN
    }

    fun raw(id: Int): Double = if (id < values.size) values[id] else Double.NaN

    override fun isNull(id: Int) = raw(id).isNaN()

    override fun value(id: Int): Any? = raw(id).takeIf { !it.isNaN() }

    override fun sortKey(id: Int): Long {
        val v = raw(id)
        if (v.isNaN()) return Long.MIN_VALUE
        val bits = java.lang.Double.doubleToLongBits(if (v == 0.0) 0.0 else v)
        return bits xor ((bits shr 63) and Long.MAX_VALUE)
    }

    override fun decode(key: Long): Any? {
        if (key == Long.MIN_VALUE) return null
        val bits = key xor ((key shr 63) and Long.MAX_VALUE)
        return java.lang.Double.longBitsToDouble(bits)
    }

    fun filter(from: Double, to: Double, domain: RoaringBitmap): RoaringBitmap {
        val v = values
        return scan(domain) { id -> id < v.size && v[id].let { !it.isNaN() && it >= from && it <= to } }
    }

    override fun memoryBytes(): Long = values.size * 8L
}

internal class DateColumn(field: MetadataField, capacity: Int) : Column(field) {
    private var days = IntArray(capacity) { NULL }

    override fun grow(capacity: Int) {
        val old = days
        days = old.copyOf(capacity).also { it.fill(NULL, old.size, capacity) }
    }

    override fun set(id: Int, value: Any?) {
        if (value == null) return
        days[id] = when (value) {
            is Int -> value
            is LocalDate -> value.toEpochDay().toInt()
            else -> LocalDate.parse(value.toString()).toEpochDay().toInt()
        }
    }

    override fun clear(id: Int) {
        days[id] = NULL
    }

    fun raw(id: Int): Int = if (id < days.size) days[id] else NULL

    override fun isNull(id: Int) = raw(id) == NULL

    override fun value(id: Int): Any? = raw(id).takeIf {
        it != NULL
    }?.let { LocalDate.ofEpochDay(it.toLong()).toString() }

    override fun sortKey(id: Int): Long = raw(id).let { if (it == NULL) Long.MIN_VALUE else it.toLong() }

    override fun decode(key: Long): Any? = if (key == Long.MIN_VALUE) null else LocalDate.ofEpochDay(key).toString()

    fun filter(from: Int, to: Int, domain: RoaringBitmap): RoaringBitmap {
        val d = days
        return scan(domain) { id -> id < d.size && d[id].let { it != NULL && it >= from && it <= to } }
    }

    override fun memoryBytes(): Long = days.size * 4L

    /** `<field>.isoWeek`: ISO 8601 week date 'YYYY-Www' (like SILO's isoWeek()) */
    fun isoWeekSource(): GroupKeySource = object : GroupKeySource {
        override val denseRange = -1

        override fun key(id: Int): Long {
            val d = raw(id)
            if (d == NULL) return Long.MIN_VALUE
            val date = LocalDate.ofEpochDay(d.toLong())
            return date.get(IsoFields.WEEK_BASED_YEAR) * 100L + date.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)
        }

        override fun decode(key: Long): Any? {
            if (key == Long.MIN_VALUE) return null
            return "%d-W%02d".format(key / 100, key % 100)
        }
    }

    companion object {
        const val NULL = Int.MIN_VALUE
    }
}

internal class BooleanColumn(field: MetadataField, capacity: Int) : Column(field) {
    /** 0 = null, 1 = false, 2 = true */
    private var values = ByteArray(capacity)
    private val trues = RoaringBitmap()
    private val falses = RoaringBitmap()

    override fun grow(capacity: Int) {
        values = values.copyOf(capacity)
    }

    override fun set(id: Int, value: Any?) {
        if (value == null) return
        val b = when (value) {
            is Boolean -> value
            else -> value.toString().toBooleanStrict()
        }
        values[id] = if (b) 2 else 1
        if (b) trues.add(id) else falses.add(id)
    }

    override fun clear(id: Int) {
        when (values[id].toInt()) {
            1 -> falses.remove(id)
            2 -> trues.remove(id)
        }
        values[id] = 0
    }

    private fun raw(id: Int): Int = if (id < values.size) values[id].toInt() else 0

    override fun isNull(id: Int) = raw(id) == 0

    override fun value(id: Int): Any? = when (raw(id)) {
        1 -> false
        2 -> true
        else -> null
    }

    override fun sortKey(id: Int): Long = if (raw(id) == 0) Long.MIN_VALUE else raw(id).toLong()

    override val denseRange: Int get() = 3

    override fun key(id: Int): Long = raw(id).toLong()

    override fun decode(key: Long): Any? = when (key) {
        1L -> false
        2L -> true
        else -> null
    }

    fun filter(value: Boolean): RoaringBitmap = (if (value) trues else falses).clone()

    override fun memoryBytes(): Long = values.size + heapBytes(trues) + heapBytes(falses)
}
