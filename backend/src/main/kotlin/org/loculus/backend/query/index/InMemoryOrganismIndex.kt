package org.loculus.backend.query.index

import com.google.re2j.Pattern
import org.loculus.backend.query.filter.And
import org.loculus.backend.query.filter.BooleanEquals
import org.loculus.backend.query.filter.DateBetween
import org.loculus.backend.query.filter.DateEquals
import org.loculus.backend.query.filter.Filter
import org.loculus.backend.query.filter.FloatBetween
import org.loculus.backend.query.filter.FloatEquals
import org.loculus.backend.query.filter.HasMutation
import org.loculus.backend.query.filter.InsertionContains
import org.loculus.backend.query.filter.IntBetween
import org.loculus.backend.query.filter.IntEquals
import org.loculus.backend.query.filter.IsNull
import org.loculus.backend.query.filter.LineageIn
import org.loculus.backend.query.filter.Maybe
import org.loculus.backend.query.filter.NOf
import org.loculus.backend.query.filter.Not
import org.loculus.backend.query.filter.Or
import org.loculus.backend.query.filter.StringEquals
import org.loculus.backend.query.filter.StringRegex
import org.loculus.backend.query.filter.SymbolEquals
import org.loculus.backend.query.filter.True
import org.loculus.backend.query.request.OrderByField
import org.loculus.backend.query.request.OrderDirection
import org.loculus.backend.query.request.RandomOrder
import org.loculus.backend.query.schema.MutationCode
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.schema.SequenceType
import org.roaringbitmap.RoaringBitmap
import java.util.Random
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ForkJoinPool
import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write
import kotlin.math.ceil

/** SILO ambiguity modes (NONE at top level, maybe() -> UPPER_BOUND, NOT swaps UPPER/LOWER) */
internal enum class AmbiguityMode {
    NONE,
    UPPER_BOUND,
    LOWER_BOUND,
    ;

    fun inverted() = when (this) {
        UPPER_BOUND -> LOWER_BOUND
        LOWER_BOUND -> UPPER_BOUND
        NONE -> NONE
    }
}

/**
 * Columnar in-memory index of one organism (see [SequenceIndex] and [Column] for the data structures).
 *
 * Concurrency: all reads run under a read lock; [apply] prepares its work outside the lock and mutates under
 * the write lock (typically a few ms per batch). Bitmaps returned to callers are always fresh copies.
 *
 * Deleting / updating an entry needs to remove its id from every bitmap it is in. Instead of keeping each
 * entry's mutation codes (~200 ints per SARS-CoV-2 entry = ~800 MB per million), removal probes all bitmaps
 * (~110k for SARS-CoV-2) for the changed ids, in parallel and outside the write lock; the locked phase then
 * only does point removals (965k SARS-CoV-2 entries: 1 changed entry ~10 ms prepare / 0.4 ms locked, 96 entries
 * ~50 ms / 11 ms). This suits the small incremental batches of the changelog tailer; large batches trigger a
 * full reload in [QueryIndexService] instead.
 */
class InMemoryOrganismIndex(override val schema: QuerySchema, initialCapacity: Int = 1024) : OrganismIndex {
    private val lock = ReentrantReadWriteLock()
    private var capacity = maxOf(16, initialCapacity)
    private val alive = RoaringBitmap()
    private val columns: List<Column> = schema.metadata.map { Column.create(it, capacity) }
    private val columnsByName: Map<String, Column> = columns.associateBy { it.field.name }
    private val sequences: Array<SequenceIndex?> = run {
        val all = schema.allSequences()
        val array = arrayOfNulls<SequenceIndex>((all.maxOfOrNull { it.index } ?: -1) + 1)
        all.forEach { array[it.index] = SequenceIndex(it) }
        array
    }
    private val insertionPatterns = ConcurrentHashMap<String, Pattern>()

    @Volatile override var dataVersion: Long = 0
        private set

    val size: Int get() = lock.read { alive.cardinality }

    // =====================================================================================================
    // writes
    // =====================================================================================================

    /** adds rows without locking; only for building an index that is not yet visible to readers */
    fun addForBulkLoad(row: IndexRow) {
        if (alive.contains(row.id)) removeIds(RoaringBitmap.bitmapOf(row.id), collectIntersecting(row.idSet()))
        addRow(row)
    }

    /** call after the last [addForBulkLoad] (compresses bitmaps) */
    fun finishBulkLoad(dataVersion: Long) {
        sequences.forEach { it?.runOptimize() }
        alive.runOptimize()
        this.dataVersion = dataVersion
    }

    /**
     * Applies a batch of changes: [upserts] replace (or add) entries, [deletedIds] are removed.
     * Safe to call while readers are active (from one writer thread at a time).
     */
    fun apply(rows: List<IndexRow>, deletedIds: Collection<Int>, dataVersion: Long? = null): ApplyStats {
        val started = System.nanoTime()
        val upserts = rows.associateBy { it.id }.values.toList() // last one wins
        val changed = RoaringBitmap()
        upserts.forEach { changed.add(it.id) }
        deletedIds.forEach { changed.add(it) }
        val toRemove = RoaringBitmap.and(changed, alive)
        // read-only preparation outside the write lock (only this writer thread mutates)
        val intersecting = if (toRemove.isEmpty) emptyList() else collectIntersecting(toRemove)
        val prepared = System.nanoTime()
        val locked: Long
        lock.write {
            locked = System.nanoTime()
            if (!toRemove.isEmpty) removeIds(toRemove, intersecting)
            upserts.forEach { addRow(it) }
            sequences.forEach { it?.invalidateCaches() }
            if (dataVersion != null) this.dataVersion = dataVersion
        }
        val done = System.nanoTime()
        return ApplyStats(
            upserts = upserts.size,
            removed = toRemove.cardinality,
            prepareMs = (prepared - started) / 1e6,
            waitForLockMs = (locked - prepared) / 1e6,
            lockedMs = (done - locked) / 1e6,
        )
    }

    data class ApplyStats(
        val upserts: Int,
        val removed: Int,
        val prepareMs: Double,
        val waitForLockMs: Double,
        val lockedMs: Double,
    )

    private fun IndexRow.idSet() = RoaringBitmap.bitmapOf(id)

    private fun collectIntersecting(ids: RoaringBitmap): List<List<SequenceIndex.Removal>> = sequences.map { seq ->
        ArrayList<SequenceIndex.Removal>().also { seq?.collectIntersecting(ids, parallelPool, it) }
    }

    private fun removeIds(ids: RoaringBitmap, intersecting: List<List<SequenceIndex.Removal>>) {
        sequences.forEachIndexed { i, seq -> seq?.remove(ids, intersecting[i]) }
        forEachId(ids) { id -> columns.forEach { it.clear(id) } }
        alive.andNot(ids)
    }

    private fun ensureCapacity(id: Int) {
        if (id < capacity) return
        var newCapacity = capacity
        while (newCapacity <= id) newCapacity = maxOf(newCapacity * 3 / 2, newCapacity + 1024)
        columns.forEach { it.grow(newCapacity) }
        capacity = newCapacity
    }

    private fun addRow(row: IndexRow) {
        val id = row.id
        require(id >= 0) { "negative id $id" }
        ensureCapacity(id)
        alive.add(id)
        for (i in columns.indices) {
            try {
                columns[i].set(id, row.values.getOrNull(i))
            } catch (e: RuntimeException) {
                // a value that does not fit the column type (e.g. "abc" in an int field) is treated as null
                columns[i].clear(id)
            }
        }
        for (seqIndex in row.presentSequences) sequences.getOrNull(seqIndex)?.present?.add(id)
        for (code in row.mutations) {
            val seq = sequences.getOrNull(MutationCode.seqIndex(code)) ?: continue
            seq.addMutation(id, MutationCode.position(code), MutationCode.symbolIndex(code))
        }
        addMissing(id, row.missing)
        for (insertion in row.insertions) {
            val first = insertion.indexOf(':')
            val second = insertion.indexOf(':', first + 1)
            if (first < 0 || second < 0) continue
            val seq = sequences.getOrNull(insertion.substring(0, first).toIntOrNull() ?: continue) ?: continue
            val position = insertion.substring(first + 1, second).toIntOrNull() ?: continue
            seq.addInsertion(id, position, insertion.substring(second + 1))
        }
    }

    private fun addMissing(id: Int, missing: IntArray) {
        val triples = missing.size / 3
        if (triples == 0) return
        var sortedBySeq = true
        for (t in 1 until triples) if (missing[3 * t] < missing[3 * t - 3]) sortedBySeq = false
        val order = if (sortedBySeq) {
            (0 until triples).toList()
        } else {
            (0 until triples).sortedBy { missing[3 * it] }
        }
        val runs = IntArray(2 * triples)
        var t = 0
        while (t < order.size) {
            val seqIndex = missing[3 * order[t]]
            var count = 0
            while (t < order.size && missing[3 * order[t]] == seqIndex) {
                runs[2 * count] = missing[3 * order[t] + 1]
                runs[2 * count + 1] = missing[3 * order[t] + 2]
                count++
                t++
            }
            val seq = sequences.getOrNull(seqIndex) ?: continue
            val n = SequenceIndex.normalizeRuns(runs, count)
            for (r in 0 until n) seq.addMissingRun(id, runs[2 * r], runs[2 * r + 1])
        }
    }

    // =====================================================================================================
    // filters
    // =====================================================================================================

    override fun evaluate(filter: Filter): RoaringBitmap = lock.read {
        val result = eval(filter, AmbiguityMode.NONE, alive)
        result.and(alive)
        result
    }

    private fun column(name: String): Column = columnsByName[name] ?: schema.field(name)?.let { columnsByName[it.name] }
        ?: throw IllegalArgumentException("Unknown metadata field '$name'")

    private fun sequence(index: Int): SequenceIndex =
        sequences.getOrNull(index) ?: throw IllegalArgumentException("Unknown sequence index $index")

    /**
     * Returns a fresh bitmap S with S ∩ [domain] = F ∩ [domain] (callers only use the result within their
     * domain, which lets scans skip ids already excluded by an enclosing And).
     */
    private fun eval(filter: Filter, mode: AmbiguityMode, domain: RoaringBitmap): RoaringBitmap = when (filter) {
        True -> domain.clone()

        is And -> evalAnd(filter.children, mode, domain)

        is Or -> unionOf(filter.children.map { eval(it, mode, domain) })

        is Not -> domain.clone().also { it.andNot(eval(filter.child, mode.inverted(), domain)) }

        is Maybe -> eval(filter.child, AmbiguityMode.UPPER_BOUND, domain)

        is NOf -> evalNOf(filter, mode, domain)

        is StringEquals -> {
            val col = stringColumn(filter.field)
            if (filter.value == null) col.isNullFilter(domain) else col.equalsFilter(filter.value, domain)
        }

        is StringRegex -> stringColumn(filter.field).regexFilter(filter.pattern, domain)

        is LineageIn -> {
            val col = stringColumn(filter.field)
            val lineages = filter.lineages
            if (lineages == null) {
                col.isNullFilter(domain)
            } else {
                col.inFilter(lineages.map { col.dictionary.lookup(it) }.toIntArray(), false, domain)
            }
        }

        is IntEquals -> filter.value?.let { intColumn(filter.field).filter(it, it, domain) }
            ?: column(filter.field).isNullFilter(domain)

        is IntBetween -> intColumn(filter.field).filter(
            filter.from ?: (Long.MIN_VALUE + 1),
            filter.to ?: Long.MAX_VALUE,
            domain,
        )

        is FloatEquals -> filter.value?.let { floatColumn(filter.field).filter(it, it, domain) }
            ?: column(filter.field).isNullFilter(domain)

        is FloatBetween -> floatColumn(filter.field).filter(
            filter.from ?: Double.NEGATIVE_INFINITY,
            filter.to ?: Double.POSITIVE_INFINITY,
            domain,
        )

        is DateEquals -> filter.value?.let { dateColumn(filter.field).filter(it, it, domain) }
            ?: column(filter.field).isNullFilter(domain)

        is DateBetween -> dateColumn(filter.field).filter(
            filter.from ?: (Int.MIN_VALUE + 1),
            filter.to ?: Int.MAX_VALUE,
            domain,
        )

        is BooleanEquals -> filter.value?.let { booleanColumn(filter.field).filter(it) }
            ?: column(filter.field).isNullFilter(domain)

        is IsNull -> column(filter.field).isNullFilter(domain)

        is SymbolEquals -> {
            val seq = sequence(filter.sequenceIndex)
            val mask = if (mode == AmbiguityMode.UPPER_BOUND) {
                seq.alphabet.ambiguitySymbols[filter.symbolIndex]
            } else {
                1 shl filter.symbolIndex
            }
            seq.symbolInSet(filter.position, mask)
        }

        is HasMutation -> {
            val seq = sequence(filter.sequenceIndex)
            if (filter.position < 1 || filter.position > seq.length) {
                RoaringBitmap()
            } else {
                val all = (1 shl seq.alphabet.size) - 1
                val ref = seq.reference(filter.position)
                val mask = if (mode == AmbiguityMode.UPPER_BOUND) {
                    all and (1 shl ref).inv()
                } else {
                    all and seq.alphabet.ambiguitySymbols[ref].inv()
                }
                seq.symbolInSet(filter.position, mask)
            }
        }

        is InsertionContains -> {
            if (insertionPatterns.size > 1024) insertionPatterns.clear()
            val pattern = insertionPatterns.computeIfAbsent(filter.regex) { Pattern.compile(it) }
            sequence(filter.sequenceIndex).insertionMatching(filter.position, pattern)
        }
    }

    private fun evalAnd(children: List<Filter>, mode: AmbiguityMode, domain: RoaringBitmap): RoaringBitmap {
        val (negated, positive) = children.partition { it is Not }
        var acc: RoaringBitmap? = null
        for (child in positive.sortedBy { cost(it) }) {
            val r = eval(child, mode, acc ?: domain)
            if (acc == null) acc = r.also { it.and(domain) } else acc.and(r)
            if (acc.isEmpty) return acc
        }
        val result = acc ?: domain.clone()
        for (child in negated.sortedBy { cost(it) }) {
            result.andNot(eval((child as Not).child, mode.inverted(), result))
            if (result.isEmpty) break
        }
        return result
    }

    /** 0 = answered from bitmaps, 1 = scan, 2 = composite */
    private fun cost(filter: Filter): Int = when (filter) {
        is SymbolEquals, is HasMutation, is InsertionContains, is BooleanEquals, is IsNull, True -> 0

        is StringEquals, is LineageIn, is StringRegex ->
            if ((columnsByName[filter.fieldName()] as? StringColumn)?.hasBitmaps == true) 0 else 1

        is IntEquals, is IntBetween, is FloatEquals, is FloatBetween, is DateEquals, is DateBetween -> 1

        else -> 2
    }

    private fun Filter.fieldName(): String? = when (this) {
        is StringEquals -> field
        is LineageIn -> field
        is StringRegex -> field
        else -> null
    }?.let { schema.field(it)?.name }

    private fun evalNOf(filter: NOf, mode: AmbiguityMode, domain: RoaringBitmap): RoaringBitmap {
        val n = filter.n
        val m = filter.children.size
        if (!filter.exactly && n <= 0) return domain.clone()
        if (n > m || n < 0) return RoaringBitmap()
        val results = filter.children.map { eval(it, mode, domain) }
        if (n == 0) return domain.clone().also { d -> results.forEach { d.andNot(it) } }
        val top = if (filter.exactly) n + 1 else n
        val result = if (top.toLong() * m <= 256) {
            // atLeast[j] = ids matched by >= j of the children processed so far
            val atLeast = arrayOfNulls<RoaringBitmap>(top + 1)
            results.forEachIndexed { processed, r ->
                for (j in minOf(processed + 1, top) downTo 2) {
                    val previous = atLeast[j - 1] ?: continue
                    val add = RoaringBitmap.and(previous, r)
                    atLeast[j] = atLeast[j]?.also { it.or(add) } ?: add
                }
                atLeast[1] = atLeast[1]?.also { it.or(r) } ?: r.clone()
            }
            val atLeastN = atLeast[n] ?: RoaringBitmap()
            if (filter.exactly) atLeast[n + 1]?.let { atLeastN.andNot(it) }
            atLeastN
        } else {
            val counts = IntArray(capacity)
            results.forEach { r -> forEachId(r) { if (it < counts.size) counts[it]++ } }
            if (filter.exactly) scan(domain) { counts[it] == n } else scan(domain) { counts[it] >= n }
        }
        result.and(domain)
        return result
    }

    private fun stringColumn(name: String) = column(name) as? StringColumn
        ?: throw IllegalArgumentException("'$name' is not a string field")

    private fun intColumn(name: String) =
        column(name) as? IntColumn ?: throw IllegalArgumentException("'$name' is not an int field")

    private fun floatColumn(name: String) =
        column(name) as? FloatColumn ?: throw IllegalArgumentException("'$name' is not a float field")

    private fun dateColumn(name: String) =
        column(name) as? DateColumn ?: throw IllegalArgumentException("'$name' is not a date field")

    private fun booleanColumn(name: String) =
        column(name) as? BooleanColumn ?: throw IllegalArgumentException("'$name' is not a boolean field")

    // =====================================================================================================
    // aggregate
    // =====================================================================================================

    /**
     * [fields]: metadata fields, `<dateField>.isoWeek`, or sequence positions `[21]` (default nucleotide
     * sequence), `main[21]`, `E[9]` (value = symbol at that position as a String, null without sequence).
     */
    override fun aggregate(ids: RoaringBitmap, fields: List<String>): List<AggregatedRow> = lock.read {
        val live = RoaringBitmap.and(ids, alive)
        if (fields.isEmpty()) return@read listOf(AggregatedRow(emptyList(), live.longCardinality))
        val sources = fields.map { groupKeySource(it, live) }
        if (sources.size == 1 && sources[0].denseRange > 0) {
            aggregateSingleDense(live, sources[0])
        } else {
            aggregateGeneric(live, sources)
        }
    }

    private val positionField = Regex("^([A-Za-z0-9_-]*)\\[(\\d+)]$")

    private fun groupKeySource(field: String, ids: RoaringBitmap): GroupKeySource {
        columnsByName[field]?.let { return it }
        schema.field(field)?.let { return columnsByName.getValue(it.name) }
        if (field.endsWith(".isoWeek", ignoreCase = true)) {
            val base = column(field.substring(0, field.length - ".isoWeek".length))
            return (base as? DateColumn)?.isoWeekSource()
                ?: throw IllegalArgumentException("isoWeek requires a date field: $field")
        }
        val match = positionField.matchEntire(field) ?: throw IllegalArgumentException("Unknown field '$field'")
        val name = match.groupValues[1]
        val position = match.groupValues[2].toInt()
        val seqSchema = if (name.isEmpty()) {
            schema.defaultNucleotideSequence
        } else {
            schema.gene(name) ?: schema.nucleotideSequence(name)
        } ?: throw IllegalArgumentException("Unknown sequence in field '$field'")
        return symbolAtPositionSource(sequence(seqSchema.index), position, ids)
    }

    private fun symbolAtPositionSource(seq: SequenceIndex, position: Int, ids: RoaringBitmap): GroupKeySource {
        require(position in 1..seq.length) { "position $position out of range for ${seq.schema.name}" }
        val symbols = ByteArray(capacity) { -1 }
        val ref = seq.reference(position).toByte()
        forEachId(RoaringBitmap.and(ids, seq.present)) { symbols[it] = ref }
        seq.mutations[position]?.forEachIndexed { s, bm -> bm?.forEach { id: Int -> symbols[id] = s.toByte() } }
        seq.missingAt(position).forEach { id: Int -> symbols[id] = seq.alphabet.missingIndex.toByte() }
        val chars = seq.alphabet.symbols
        return object : GroupKeySource {
            override val denseRange = chars.size + 1

            override fun key(id: Int): Long = (symbols[id] + 1).toLong()

            override fun decode(key: Long): Any? = if (key == 0L) null else chars[key.toInt() - 1].toString()
        }
    }

    private fun aggregateSingleDense(ids: RoaringBitmap, source: GroupKeySource): List<AggregatedRow> {
        val counts = LongArray(source.denseRange)
        val order = IntArray(source.denseRange)
        var groups = 0
        if (source is StringColumn) {
            forEachId(ids) { id ->
                val k = source.code(id) + 1
                if (counts[k]++ == 0L) order[groups++] = k
            }
        } else {
            forEachId(ids) { id ->
                val k = source.key(id).toInt()
                if (counts[k]++ == 0L) order[groups++] = k
            }
        }
        return (0 until groups).map { g ->
            val k = order[g]
            AggregatedRow(listOf(source.decode(k.toLong())), counts[k])
        }
    }

    /** numeric keys (int, date, iso week) spanning a small range over [ids] become dense keys */
    private fun densified(source: GroupKeySource, ids: RoaringBitmap): GroupKeySource {
        if (source.denseRange > 0) return source
        var min = Long.MAX_VALUE
        var max = Long.MIN_VALUE
        forEachId(ids) { id ->
            val k = source.key(id)
            if (k != Long.MIN_VALUE) {
                if (k < min) min = k
                if (k > max) max = k
            }
        }
        if (min == Long.MAX_VALUE) min = 0
        if (max != Long.MIN_VALUE && (max - min < 0 || max - min >= MAX_DENSE_RANGE)) return source
        val offset = min
        val range = (if (max == Long.MIN_VALUE) 0 else max - min + 1).toInt() + 1
        return object : GroupKeySource {
            override val denseRange = range

            override fun key(id: Int): Long {
                val k = source.key(id)
                return if (k == Long.MIN_VALUE) 0 else k - offset + 1
            }

            override fun decode(key: Long): Any? = source.decode(if (key == 0L) Long.MIN_VALUE else key - 1 + offset)
        }
    }

    private fun aggregateGeneric(ids: RoaringBitmap, rawSources: List<GroupKeySource>): List<AggregatedRow> {
        val sources = rawSources.map { densified(it, ids) }
        if (sources.size == 1 && sources[0].denseRange > 0) return aggregateSingleDense(ids, sources[0])
        val m = sources.size
        val n = ids.cardinality
        // per source: dense key or a per-query densification of the raw keys (first seen)
        val densifiers = Array(m) { if (sources[it].denseRange > 0) null else LongIntMap() }
        val rawKeys = Array(m) { if (densifiers[it] == null) null else LongArrayList() }
        val radix = LongArray(m) { if (sources[it].denseRange > 0) sources[it].denseRange.toLong() else n + 1L }
        var product = 1.0
        radix.forEach { product *= it.toDouble() }
        // composite key -> group: a direct table for small key spaces, else a hash map
        val table = if (product <= MAX_DIRECT_GROUP_TABLE) IntArray(product.toInt()) else null
        val groupIndex = if (table == null && product < 9.0e18) LongIntMap() else null
        val fallback = if (table == null && groupIndex == null) HashMap<List<Long>, Int>() else null
        val groupComposite = LongArrayList()
        val groupTuples = ArrayList<LongArray>()
        var counts = LongArray(64)
        var groups = 0
        val local = LongArray(m)
        forEachId(ids) { id ->
            var composite = 0L
            for (f in 0 until m) {
                val raw = sources[f].key(id)
                val d = densifiers[f]
                local[f] = if (d == null) {
                    raw
                } else {
                    val next = d.size
                    val code = d.getOrPut(raw, next)
                    if (code == next) rawKeys[f]!!.add(raw)
                    code.toLong()
                }
                composite = composite * radix[f] + local[f]
            }
            val g = when {
                table != null -> {
                    val stored = table[composite.toInt()]
                    if (stored == 0) {
                        table[composite.toInt()] = groups + 1
                        groups
                    } else {
                        stored - 1
                    }
                }

                groupIndex != null -> groupIndex.getOrPut(composite, groups)

                else -> fallback!!.getOrPut(local.toList()) { groups }
            }
            if (g == groups) {
                if (fallback != null) groupTuples.add(local.copyOf()) else groupComposite.add(composite)
                if (groups == counts.size) counts = counts.copyOf(groups * 2)
                groups++
            }
            counts[g]++
        }
        return (0 until groups).map { g ->
            val tuple = if (fallback != null) {
                groupTuples[g]
            } else {
                var c = groupComposite[g]
                val t = LongArray(m)
                for (f in m - 1 downTo 0) {
                    t[f] = c % radix[f]
                    c /= radix[f]
                }
                t
            }
            AggregatedRow(
                List(m) { f -> sources[f].decode(rawKeys[f]?.get(tuple[f].toInt()) ?: tuple[f]) },
                counts[g],
            )
        }
    }

    // =====================================================================================================
    // select (details / sequences ordering)
    // =====================================================================================================

    override fun select(
        ids: RoaringBitmap,
        orderBy: List<OrderByField>,
        random: RandomOrder?,
        offset: Int,
        limit: Int?,
    ): IntArray = lock.read {
        val live = RoaringBitmap.and(ids, alive)
        val n = live.cardinality
        val from = minOf(maxOf(offset, 0), n)
        if (orderBy.isEmpty() && random == null) {
            val count = minOf(n - from, limit ?: Int.MAX_VALUE)
            if (count <= 0) return@read IntArray(0)
            val result = IntArray(count)
            val iterator = live.intIterator
            var skipped = 0
            while (skipped < from) {
                iterator.next()
                skipped++
            }
            for (i in 0 until count) result[i] = iterator.next()
            return@read result
        }
        val keys = SortKeys(orderBy.map { column(it.field) }, orderBy.map { it.direction })
        val ordered: IntArray = when {
            orderBy.isEmpty() -> live.toArray()

            random == null && limit != null && from.toLong() + limit < n / 4 ->
                keys.topK(live, from + limit)

            else -> keys.sort(live.toArray())
        }
        // a top-k result holds the first offset + limit rows, so the offset applies to it the same way
        val start = from.coerceAtMost(ordered.size)
        val remaining = ordered.size - start
        val count = minOf(remaining, limit ?: Int.MAX_VALUE)
        if (count <= 0) return@read IntArray(0)
        if (random != null) {
            // partial Fisher-Yates over the rows after the offset: only the first [count] are needed
            val rng = Random(random.seed ?: System.nanoTime())
            for (i in 0 until count) {
                val j = start + i + rng.nextInt(remaining - i)
                val tmp = ordered[start + i]
                ordered[start + i] = ordered[j]
                ordered[j] = tmp
            }
        }
        ordered.copyOfRange(start, start + count)
    }

    private inner class SortKeys(val cols: List<Column>, directions: List<OrderDirection>) {
        private val m = cols.size
        private val descending = BooleanArray(m) { directions[it] == OrderDirection.DESCENDING }
        private val ranks: Array<IntArray?> = Array(m) { (cols[it] as? StringColumn)?.ranks()?.rank }
        private val stringCols: Array<StringColumn?> = Array(m) { cols[it] as? StringColumn }

        fun key(f: Int, id: Int): Long {
            val r = ranks[f]
            val raw = if (r != null) {
                val code = stringCols[f]!!.code(id)
                if (code < 0) Long.MIN_VALUE else r[code].toLong()
            } else {
                cols[f].sortKey(id)
            }
            // bitwise not reverses the order of all longs (nulls = MIN_VALUE become largest -> last)
            return if (descending[f]) raw.inv() else raw
        }

        /** stable sort of ids (given in id order) */
        fun sort(ids: IntArray): IntArray {
            val n = ids.size
            val keys = LongArray(n * m)
            for (i in 0 until n) for (f in 0 until m) keys[i * m + f] = key(f, ids[i])
            val order = IntArray(n) { it }
            mergeSort(order) { a, b -> compareRows(keys, a, keys, b) }
            return IntArray(n) { ids[order[it]] }
        }

        private fun compareRows(ka: LongArray, a: Int, kb: LongArray, b: Int): Int {
            for (f in 0 until m) {
                val c = ka[a * m + f].compareTo(kb[b * m + f])
                if (c != 0) return c
            }
            return 0
        }

        /** the first [k] ids in sort order (ties by id), via a bounded max-heap */
        fun topK(ids: RoaringBitmap, k: Int): IntArray {
            if (k <= 0) return IntArray(0)
            val heapIds = IntArray(k)
            val heapKeys = LongArray(k * m)
            val tmp = LongArray(m)
            var size = 0

            fun greater(ka: LongArray, a: Int, idA: Int, kb: LongArray, b: Int, idB: Int): Boolean {
                for (f in 0 until m) {
                    val c = ka[a * m + f].compareTo(kb[b * m + f])
                    if (c != 0) return c > 0
                }
                return idA > idB
            }

            fun swap(i: Int, j: Int) {
                val t = heapIds[i]
                heapIds[i] = heapIds[j]
                heapIds[j] = t
                for (f in 0 until m) {
                    val x = heapKeys[i * m + f]
                    heapKeys[i * m + f] = heapKeys[j * m + f]
                    heapKeys[j * m + f] = x
                }
            }

            fun siftDown(start: Int) {
                var i = start
                while (true) {
                    val l = 2 * i + 1
                    if (l >= size) return
                    var largest = if (greater(heapKeys, l, heapIds[l], heapKeys, i, heapIds[i])) l else i
                    val r = l + 1
                    if (r < size && greater(heapKeys, r, heapIds[r], heapKeys, largest, heapIds[largest])) largest = r
                    if (largest == i) return
                    swap(i, largest)
                    i = largest
                }
            }

            forEachId(ids) { id ->
                for (f in 0 until m) tmp[f] = key(f, id)
                if (size < k) {
                    heapIds[size] = id
                    System.arraycopy(tmp, 0, heapKeys, size * m, m)
                    var i = size++
                    while (i > 0) {
                        val parent = (i - 1) / 2
                        if (!greater(heapKeys, i, heapIds[i], heapKeys, parent, heapIds[parent])) break
                        swap(i, parent)
                        i = parent
                    }
                } else if (greater(heapKeys, 0, heapIds[0], tmp, 0, id)) {
                    heapIds[0] = id
                    System.arraycopy(tmp, 0, heapKeys, 0, m)
                    siftDown(0)
                }
            }
            val order = IntArray(size) { it }
            mergeSort(order) { a, b ->
                val c = compareRows(heapKeys, a, heapKeys, b)
                if (c != 0) c else heapIds[a].compareTo(heapIds[b])
            }
            return IntArray(size) { heapIds[order[it]] }
        }
    }

    override fun value(id: Int, field: String): Any? = lock.read {
        if (!alive.contains(id)) null else column(field).value(id)
    }

    // =====================================================================================================
    // mutations / insertions
    // =====================================================================================================

    override fun mutations(ids: RoaringBitmap, type: SequenceType, minProportion: Double): List<MutationRow> =
        lock.read {
            val seqs = if (type == SequenceType.NUCLEOTIDE) schema.nucleotideSequences else schema.genes
            val result = ArrayList<MutationRow>()
            for (seqSchema in seqs) {
                val seq = sequence(seqSchema.index)
                val filtered = forIntersections(RoaringBitmap.and(ids, seq.present))
                val n = filtered.cardinality
                if (n == 0) continue
                val full = n == seq.present.cardinality
                val missingAll = seq.missingCountsAll()
                val cardinalities = if (full) seq.mutationCounts else null
                val blocks = (seq.length shr SequenceIndex.CHECKPOINT_SHIFT) + 1
                val computeBlock = { k: Int ->
                    mutationsInBlock(seq, k, filtered, n, cardinalities, missingAll, minProportion)
                }
                val perBlock: List<List<MutationRow>> = if (full || !parallelMutations) {
                    (0 until blocks).map(computeBlock)
                } else {
                    parallelPool.submit<List<List<MutationRow>>> {
                        (0 until blocks).toList().parallelStream().map(computeBlock).toList()
                    }.get()
                }
                perBlock.forEach { result.addAll(it) }
            }
            result
        }

    private fun threshold(coverage: Long, minProportion: Double): Long =
        if (minProportion == 0.0) 0 else ceil(coverage.toDouble() * minProportion).toLong() - 1

    private fun mutationsInBlock(
        seq: SequenceIndex,
        k: Int,
        ids: RoaringBitmap,
        n: Int,
        cardinalities: IntArray?,
        missingAll: IntArray,
        minProportion: Double,
    ): List<MutationRow> {
        val full = cardinalities != null
        val shift = SequenceIndex.CHECKPOINT_SHIFT
        val first = maxOf(1, k shl shift)
        val last = minOf(seq.length, (k shl shift) + SequenceIndex.CHECKPOINT_SPACING - 1)
        if (first > last) return emptyList()
        val alphabet = seq.alphabet
        val validMask = alphabet.validMutationMask
        val symbolCount = alphabet.size
        val rows = ArrayList<MutationRow>()
        // candidates that need the exact missing count (filtered case only)
        var candidates: IntArray? = null
        var candidateCounts: LongArray? = null
        var candidateUpper: LongArray? = null
        var nCandidates = 0
        val counts = LongArray(symbolCount)
        for (p in first..last) {
            val perSymbol = seq.mutations[p] ?: continue
            var invalid = 0L
            var validSum = 0L
            var validMax = 0L
            val ref = seq.reference(p)
            // valid symbols first: the (many) ambiguity-code bitmaps only matter where something is reportable
            for (s in 0 until symbolCount) {
                if (validMask and (1 shl s) == 0) continue
                val bm = perSymbol[s]
                val c = when {
                    bm == null -> 0L
                    cardinalities != null -> cardinalities[p * symbolCount + s].toLong()
                    else -> RoaringBitmap.andCardinality(ids, bm).toLong()
                }
                counts[s] = c
                validSum += c
                if (s != ref && c > validMax) validMax = c
            }
            if (validMax == 0L) continue
            for (s in 0 until symbolCount) {
                if (validMask and (1 shl s) != 0) continue
                val bm = perSymbol[s]
                val c = when {
                    bm == null -> 0L
                    cardinalities != null -> cardinalities[p * symbolCount + s].toLong()
                    else -> RoaringBitmap.andCardinality(ids, bm).toLong()
                }
                counts[s] = c
                invalid += c
            }
            val refValid = validMask and (1 shl ref) != 0
            if (!refValid) {
                // the (implicit) reference count is not part of the coverage
                emitMutations(seq, p, counts, validSum, minProportion, rows)
                continue
            }
            val upper = n - invalid
            if (full) {
                emitMutations(seq, p, counts, upper - missingAll[p], minProportion, rows)
                continue
            }
            // missing among the filtered ids <= missing among all ids
            val minCoverage = maxOf(upper - minOf(missingAll[p].toLong(), upper), validSum)
            if (validMax <= threshold(minCoverage, minProportion)) continue
            if (candidates == null) {
                candidates = IntArray(last - first + 1)
                candidateCounts = LongArray((last - first + 1) * symbolCount)
                candidateUpper = LongArray(last - first + 1)
            }
            candidates[nCandidates] = p
            System.arraycopy(counts, 0, candidateCounts!!, nCandidates * symbolCount, symbolCount)
            candidateUpper!![nCandidates] = upper
            nCandidates++
        }
        if (nCandidates == 0) return rows
        // exact missing counts: start at the block's checkpoint and sweep the run transitions
        var missing = RoaringBitmap.andCardinality(ids, seq.checkpoints[k]).toLong()
        var q = (k shl shift) + 1
        val merged = ArrayList<MutationRow>(rows.size + nCandidates)
        var r = 0
        for (c in 0 until nCandidates) {
            val p = candidates!![c]
            while (q <= p) {
                seq.runStarts[q]?.let { missing += RoaringBitmap.andCardinality(ids, it) }
                seq.runEnds[q]?.let { missing -= RoaringBitmap.andCardinality(ids, it) }
                q++
            }
            while (r < rows.size && rows[r].position < p) merged.add(rows[r++])
            System.arraycopy(candidateCounts!!, c * symbolCount, counts, 0, symbolCount)
            emitMutations(seq, p, counts, candidateUpper!![c] - missing, minProportion, merged)
        }
        while (r < rows.size) merged.add(rows[r++])
        return merged
    }

    private fun emitMutations(
        seq: SequenceIndex,
        position: Int,
        counts: LongArray,
        coverage: Long,
        minProportion: Double,
        out: MutableList<MutationRow>,
    ) {
        if (coverage <= 0) return
        val threshold = threshold(coverage, minProportion)
        val ref = seq.reference(position)
        val alphabet = seq.alphabet
        for (s in 0 until alphabet.size) {
            if (s == ref || alphabet.validMutationMask and (1 shl s) == 0) continue
            if (counts[s] > threshold) {
                out.add(
                    MutationRow(
                        sequenceIndex = seq.schema.index,
                        position = position,
                        symbolFrom = alphabet.symbols[ref],
                        symbolTo = alphabet.symbols[s],
                        count = counts[s],
                        coverage = coverage,
                    ),
                )
            }
        }
    }

    override fun insertions(ids: RoaringBitmap, type: SequenceType): List<InsertionRow> = lock.read {
        val seqs = if (type == SequenceType.NUCLEOTIDE) schema.nucleotideSequences else schema.genes
        val result = ArrayList<InsertionRow>()
        for (seqSchema in seqs) {
            val seq = sequence(seqSchema.index)
            val filtered = RoaringBitmap.and(ids, seq.present)
            if (filtered.isEmpty) continue
            val full = filtered.cardinality == seq.present.cardinality
            for (position in seq.insertions.keys.sorted()) {
                val bySymbols = seq.insertions.getValue(position)
                for (symbols in bySymbols.keys.sorted()) {
                    val bm = bySymbols.getValue(symbols)
                    val count = if (full) bm.longCardinality else RoaringBitmap.andCardinality(filtered, bm).toLong()
                    if (count > 0) result.add(InsertionRow(seqSchema.index, position, symbols, count))
                }
            }
        }
        result
    }

    // =====================================================================================================
    // diagnostics
    // =====================================================================================================

    /** per sequence: number of mutation bitmaps, their containers, and missing-run transition bitmaps */
    fun structureStats(): Map<String, List<Long>> = lock.read {
        sequences.filterNotNull().associate { seq ->
            var bitmaps = 0L
            var containers = 0L
            for (perSymbol in seq.mutations) {
                perSymbol?.forEach { bm ->
                    if (bm != null) {
                        bitmaps++
                        containers += bm.containerPointer.let { p ->
                            var c = 0L
                            while (p.container != null) {
                                c++
                                p.advance()
                            }
                            c
                        }
                    }
                }
            }
            val transitions = seq.runStarts.count { it != null } + seq.runEnds.count { it != null }
            seq.schema.name to listOf(bitmaps, containers, transitions.toLong())
        }
    }

    /** approximate heap usage of the index structures in bytes, per component */
    fun memoryUsage(): Map<String, Long> = lock.read {
        val usage = LinkedHashMap<String, Long>()
        usage["alive"] = alive.getLongSizeInBytes()
        columns.forEach { usage["metadata:${it.field.name}"] = it.memoryBytes() }
        sequences.filterNotNull().forEach { usage["sequence:${it.schema.name}"] = it.memoryBytes() }
        usage
    }

    companion object {
        /** filtered mutation counting runs position blocks in parallel (switchable for benchmarks) */
        @Volatile internal var parallelMutations = true
        private const val MAX_DENSE_RANGE = 1L shl 20
        private const val MAX_DIRECT_GROUP_TABLE = (1 shl 22).toDouble()
        private val parallelPool = ForkJoinPool(Runtime.getRuntime().availableProcessors())

        /** builds an index from [rows] (any id order; ascending is fastest) */
        fun build(schema: QuerySchema, rows: Iterable<IndexRow>, dataVersion: Long = 0): InMemoryOrganismIndex {
            val index = InMemoryOrganismIndex(schema)
            rows.forEach { index.addForBulkLoad(it) }
            index.finishBulkLoad(dataVersion)
            return index
        }
    }
}

/** stable merge sort of [a] with a primitive comparator */
internal inline fun mergeSort(a: IntArray, crossinline compare: (Int, Int) -> Int) {
    val n = a.size
    if (n < 2) return
    var src = a
    var dst = IntArray(n)
    // insertion sort runs of 32
    val run = 32
    var start = 0
    while (start < n) {
        val end = minOf(start + run, n)
        for (i in start + 1 until end) {
            val x = src[i]
            var j = i - 1
            while (j >= start && compare(src[j], x) > 0) {
                src[j + 1] = src[j]
                j--
            }
            src[j + 1] = x
        }
        start = end
    }
    var width = run
    while (width < n) {
        var lo = 0
        while (lo < n) {
            val mid = minOf(lo + width, n)
            val hi = minOf(lo + 2 * width, n)
            var i = lo
            var j = mid
            var o = lo
            while (i < mid && j < hi) dst[o++] = if (compare(src[j], src[i]) < 0) src[j++] else src[i++]
            while (i < mid) dst[o++] = src[i++]
            while (j < hi) dst[o++] = src[j++]
            lo = hi
        }
        val t = src
        src = dst
        dst = t
        width *= 2
    }
    if (src !== a) System.arraycopy(src, 0, a, 0, n)
}
