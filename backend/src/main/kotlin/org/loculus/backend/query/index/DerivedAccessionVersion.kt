package org.loculus.backend.query.index

import com.google.re2j.Pattern
import org.loculus.backend.query.schema.FieldType
import org.loculus.backend.query.schema.MetadataField
import org.loculus.backend.query.schema.QuerySchema
import org.roaringbitmap.RoaringBitmap

/** the string filters of a column: [StringColumn]s and the derived [AccessionVersionColumn] */
internal interface StringFilters {
    /** equality and in-list filters are answered without scanning */
    val hasValueIndex: Boolean
    val hasBitmaps: Boolean
    fun equalsFilter(value: String, domain: RoaringBitmap): RoaringBitmap

    /** ids equal to one of [values] (null = is null) */
    fun inFilter(values: Collection<String?>, domain: RoaringBitmap): RoaringBitmap
    fun regexFilter(pattern: String, domain: RoaringBitmap): RoaringBitmap
    fun isNullFilter(domain: RoaringBitmap): RoaringBitmap
}

internal class StringColumnFilters(private val column: StringColumn) : StringFilters {
    override val hasValueIndex get() = column.hasValueIndex
    override val hasBitmaps get() = column.hasBitmaps
    override fun equalsFilter(value: String, domain: RoaringBitmap) = column.equalsFilter(value, domain)
    override fun inFilter(values: Collection<String?>, domain: RoaringBitmap) = column.inFilter(values, domain)
    override fun regexFilter(pattern: String, domain: RoaringBitmap) = column.regexFilter(pattern, domain)
    override fun isNullFilter(domain: RoaringBitmap) = column.isNullFilter(domain)
}

/**
 * The primary key `accessionVersion`, derived as `accession + "." + version` from those two columns instead of
 * stored: no dictionary, codes or postings of its own (~40–50 B per entry at PPX sizes). Filters go through the
 * accession postings and check the version, so point and in-list lookups stay O(k).
 *
 * The projection always writes `accessionVersion` = `accession.version`; a row whose value differs (or is null
 * while accession and version are not) keeps its value as an exception, so any data is answered exactly as a
 * stored column would. Exceptions are expected to be absent ([exceptionCount] is logged after a full load).
 */
internal class AccessionVersionColumn(
    field: MetadataField,
    private val accession: StringColumn,
    private val version: IntColumn,
    private val ownIndex: Int,
    private val accessionIndex: Int,
    private val versionIndex: Int,
) : Column(field),
    StringFilters {
    /** id -> code in [exceptionValues] (-1 = null) of the entries whose value is not accession.version */
    private val exceptions = HashMap<Int, Int>()
    private val excepted = RoaringBitmap()
    private val exceptionValues = StringDictionary()

    /** an accession with a character at or before '.' was seen: (accession rank, version) is not the string order */
    @Volatile private var accessionOrderUnsafe = false

    /** a version outside 0..Int.MAX_VALUE was seen: the packed sort / group keys do not apply */
    @Volatile private var versionOutOfRange = false

    /** largest version seen (for dense group keys) */
    @Volatile private var maxVersion = 0L

    val exceptionCount: Int get() = exceptions.size

    override val hasValueIndex get() = true
    override val hasBitmaps get() = false

    override fun grow(capacity: Int) {}

    /** sets [id] from its row: only records an exception if the row's value is not accession.version */
    fun setFromRow(id: Int, values: Array<Any?>) {
        val acc = values.getOrNull(accessionIndex)?.toString()
        val ver = versionValue(values.getOrNull(versionIndex))
        if (acc != null && !accessionOrderUnsafe && acc.any { it <= '.' }) accessionOrderUnsafe = true
        if (ver != null && (ver < 0 || ver > Int.MAX_VALUE)) versionOutOfRange = true
        if (ver != null && ver > maxVersion) maxVersion = ver
        val derived = if (acc == null || ver == null) null else "$acc.$ver"
        val stored = values.getOrNull(ownIndex)?.toString()
        if (stored != derived) setException(id, stored)
    }

    /** without the row (not used by the index, which calls [setFromRow]): kept as an exception */
    override fun set(id: Int, value: Any?) = setException(id, value?.toString())

    private fun setException(id: Int, value: String?) {
        exceptions[id] = if (value == null) -1 else exceptionValues.getOrAdd(value)
        excepted.add(id)
    }

    override fun clear(id: Int) {
        if (exceptions.remove(id) != null) excepted.remove(id)
    }

    override fun isNull(id: Int): Boolean {
        val code = exceptions[id]
        if (code != null) return code < 0
        return accession.isNull(id) || version.isNull(id)
    }

    override fun value(id: Int): String? {
        val code = exceptions[id]
        if (code != null) return if (code < 0) null else exceptionValues.get(code)
        return derived(id)
    }

    private fun derived(id: Int): String? {
        val code = accession.code(id)
        if (code < 0) return null
        val v = version.raw(id)
        if (v == Long.MIN_VALUE) return null
        return accession.dictionary.get(code) + "." + v
    }

    // ---------------------------------------------------------------------------------------------------------
    // filters

    override fun equalsFilter(value: String, domain: RoaringBitmap) = inFilter(listOf(value), domain)

    override fun inFilter(values: Collection<String?>, domain: RoaringBitmap): RoaringBitmap {
        val wanted = LongIntMap(maxOf(16, values.size))
        val bigVersions = HashSet<Pair<Int, Long>>()
        val codes = IntArray(values.size)
        var n = 0
        var matchNull = false
        for (value in values) {
            if (value == null) {
                matchNull = true
                continue
            }
            val (acc, ver) = parse(value) ?: continue
            val code = accession.dictionary.lookup(acc)
            if (code < 0) continue
            codes[n++] = code
            if (ver in Int.MIN_VALUE..Int.MAX_VALUE) wanted.put(pack(code, ver), 1) else bigVersions.add(code to ver)
        }
        val candidates = accession.inFilter(codes.copyOf(n), false, domain)
        val result = scan(candidates) { id ->
            val v = version.raw(id)
            v != Long.MIN_VALUE && !excepted.contains(id) &&
                if (v in Int.MIN_VALUE..Int.MAX_VALUE) {
                    wanted.get(pack(accession.code(id), v)) >= 0
                } else {
                    (accession.code(id) to v) in bigVersions
                }
        }
        if (matchNull) result.or(derivedNulls(domain))
        if (exceptions.isNotEmpty()) {
            val valueSet = values.toHashSet()
            exceptions.forEach { (id, code) ->
                if ((if (code < 0) null else exceptionValues.get(code)) in valueSet) result.add(id)
            }
        }
        return result
    }

    override fun isNullFilter(domain: RoaringBitmap): RoaringBitmap {
        val result = derivedNulls(domain)
        exceptions.forEach { (id, code) -> if (code < 0) result.add(id) }
        return result
    }

    private fun derivedNulls(domain: RoaringBitmap): RoaringBitmap =
        scan(domain) { id -> (accession.isNull(id) || version.isNull(id)) && !excepted.contains(id) }

    override fun regexFilter(pattern: String, domain: RoaringBitmap): RoaringBitmap {
        val compiled = Pattern.compile(pattern)
        val literal = LiteralPattern.parse(pattern)
        val matchesNull = compiled.matcher("").find()
        return scan(domain) { id ->
            val s = value(id)
            if (s == null) matchesNull else literal?.foundIn(s) ?: compiled.matcher(s).find()
        }
    }

    // ---------------------------------------------------------------------------------------------------------
    // sort and group keys

    /** sort keys of [domain]'s ids in the string order of their values (UTF-8 bytes; nulls = Long.MIN_VALUE) */
    fun sortKeySource(domain: RoaringBitmap): (Int) -> Long {
        if (excepted.isEmpty && !accessionOrderUnsafe && !versionOutOfRange && accession.dictionary.size < 1 shl 28) {
            // no accession has a character <= '.', so "a.v" < "b.w" iff a < b, or a = b and "v" < "w"
            val rank = accession.ranks().rank
            return { id ->
                val code = accession.code(id)
                val v = version.raw(id)
                if (code < 0 || v == Long.MIN_VALUE) Long.MIN_VALUE else (rank[code].toLong() shl 35) or versionKey(v)
            }
        }
        // rank the values of the domain per query
        val ids = domain.toArray()
        val dictionary = StringDictionary()
        val codes = IntArray(ids.size) { i -> value(ids[i])?.let { dictionary.getOrAdd(it) } ?: -1 }
        val rank = Ranks.compute(dictionary, null).rank
        return { id ->
            val i = java.util.Arrays.binarySearch(ids, id)
            if (i < 0 || codes[i] < 0) Long.MIN_VALUE else rank[codes[i]].toLong()
        }
    }

    override fun sortKey(id: Int): Long = sortKeySource(RoaringBitmap.bitmapOf(id))(id)

    /** group keys for /aggregated over [ids]: one key per distinct value, decodable */
    fun groupKeySource(ids: RoaringBitmap): GroupKeySource {
        if (excepted.isEmpty && !versionOutOfRange) {
            // dense (accession code, version) keys when that range is small against the selection (a table of
            // counts over the range), else sparse keys that the aggregation hashes
            val versions = maxVersion + 1
            val range = (accession.dictionary.size + 1L) * versions
            if (range > MAX_DENSE_GROUP_RANGE || range > 8L * ids.cardinality + 65_536) return this
            return object : GroupKeySource {
                override val denseRange = range.toInt()

                override fun key(id: Int): Long {
                    val code = accession.code(id)
                    val v = version.raw(id)
                    return if (code < 0 || v == Long.MIN_VALUE) 0L else (code + 1L) * versions + v
                }

                override fun decode(key: Long): Any? = if (key == 0L) {
                    null
                } else {
                    accession.dictionary.get((key / versions - 1).toInt()) + "." + key % versions
                }
            }
        }
        // per-query codes of the values
        val sorted = ids.toArray()
        val dictionary = StringDictionary()
        val codes = IntArray(sorted.size) { i -> value(sorted[i])?.let { dictionary.getOrAdd(it) } ?: -1 }
        return object : GroupKeySource {
            override val denseRange = dictionary.size + 1

            override fun key(id: Int): Long {
                val i = java.util.Arrays.binarySearch(sorted, id)
                return if (i < 0) 0L else codes[i] + 1L
            }

            override fun decode(key: Long): Any? = if (key == 0L) null else dictionary.get(key.toInt() - 1)
        }
    }

    /** (accession code, version): distinct values have distinct keys while there are no exceptions */
    override fun key(id: Int): Long {
        val code = accession.code(id)
        val v = version.raw(id)
        return if (code < 0 || v == Long.MIN_VALUE) Long.MIN_VALUE else pack(code, v)
    }

    override fun decode(key: Long): Any? {
        if (key == Long.MIN_VALUE) return null
        return accession.dictionary.get((key ushr 32).toInt()) + "." + key.toInt()
    }

    override fun memoryBytes(): Long = heapBytes(excepted) + exceptionValues.memoryBytes() + exceptions.size * 64L

    companion object {
        /** derived only for Loculus's primary key with a string `accession` and an int `version` field */
        fun applies(schema: QuerySchema, field: MetadataField): Boolean = field.name == schema.primaryKey &&
            field.name == QuerySchema.PRIMARY_KEY &&
            field.type == FieldType.STRING &&
            schema.metadata.any { it.name == InMemoryOrganismIndex.ACCESSION_FIELD && it.type == FieldType.STRING } &&
            schema.metadata.any { it.name == VERSION_FIELD && it.type == FieldType.INT }

        const val VERSION_FIELD = "version"

        private fun pack(code: Int, version: Long): Long = (code.toLong() shl 32) or (version and 0xffffffffL)

        /** dense group keys up to this range (as a direct table of counts) */
        private const val MAX_DENSE_GROUP_RANGE = 1L shl 22

        /** "accession.version" split at the last '.', with a version that is exactly how a number prints */
        fun parse(value: String): Pair<String, Long>? {
            val dot = value.lastIndexOf('.')
            if (dot < 0) return null
            val start = dot + 1
            val negative = start < value.length && value[start] == '-'
            val digits = if (negative) start + 1 else start
            val length = value.length - digits
            // no digits, a leading zero, "-0" or more than a long's digits never print like this
            if (length == 0 || length > 19 || (value[digits] == '0' && (length > 1 || negative))) return null
            for (i in digits until value.length) if (value[i] !in '0'..'9') return null
            val version = value.substring(start).toLongOrNull() ?: return null
            return value.substring(0, dot) to version
        }

        /** a version like IntColumn stores it (null if it would not be stored) */
        fun versionValue(value: Any?): Long? = when (value) {
            null -> null
            is Number -> value.toLong()
            else -> value.toString().toLongOrNull()
        }?.takeIf { it != Long.MIN_VALUE }

        /** 0 <= [v] <= Int.MAX_VALUE -> a key < 2^35 in the string order of its decimal digits */
        fun versionKey(v: Long): Long = if (v <
            SMALL_VERSION_KEYS.size
        ) {
            SMALL_VERSION_KEYS[v.toInt()]
        } else {
            computeVersionKey(v)
        }

        private fun computeVersionKey(v: Long): Long {
            var length = 1
            while (length < 10 && v >= POW10[length]) length++
            var key = 0L
            for (i in 0 until 10) key = key * 11 + (if (i < length) (v / POW10[length - 1 - i]) % 10 + 1 else 0)
            return key
        }

        private val POW10 = LongArray(11).also { p ->
            p[0] = 1
            for (i in 1 until p.size) p[i] = p[i - 1] * 10
        }

        private val SMALL_VERSION_KEYS = LongArray(1024) { computeVersionKey(it.toLong()) }
    }
}
