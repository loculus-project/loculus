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
    private val regexCache = RegexCache()
    private val columns: List<Column> = schema.metadata.map {
        Column.create(
            it,
            capacity,
            lookupByValue = it.name == schema.primaryKey || it.name == ACCESSION_FIELD,
            regexCache = regexCache,
        )
    }
    private val columnsByName: Map<String, Column> = columns.associateBy { it.field.name }
    private val sequences: Array<SequenceIndex?> = run {
        val all = schema.allSequences()
        val array = arrayOfNulls<SequenceIndex>((all.maxOfOrNull { it.index } ?: -1) + 1)
        all.forEach { array[it.index] = SequenceIndex(it) }
        array
    }
    private val insertionPatterns = ConcurrentHashMap<String, Pattern>()

    /**
     * Presorted orders for [select] (see [SortPermutation]): today only the organism's default sort. Built at full
     * load and rebuilt after [apply] once more than [permutationRebuildThreshold] entries changed. Another commonly
     * used sort would get its own entry here (e.g. built on demand once a sort repeats); [select] picks the one whose
     * column matches the request's first key.
     */
    private val permutationKeys: List<Pair<Column, Boolean>> = listOfNotNull(
        schema.defaultOrderBy?.let { columnsByName[it] }?.let { it to schema.defaultOrderDescending },
    )

    @Volatile private var permutations: List<SortPermutation> = emptyList()

    /** ids changed by [apply] since the permutations were built (not in their place there) */
    private var permutationStale = RoaringBitmap()

    @Volatile override var dataVersion: Long = 0
        private set

    /** random per instance, so tokens of a reloaded index (or another replica) never match an older one */
    private val instanceId = java.util.UUID.randomUUID().toString().substring(0, 8)

    @Volatile private var generation: Long = 0

    override val contentToken: String get() = "$instanceId.$generation"

    /**
     * Reads the current projection rows of a few ids (injected by [QueryIndexService]); used to answer
     * mutations / insertions over small id sets directly instead of visiting every bitmap.
     */
    @Volatile var rowLoader: ((Collection<Int>) -> List<IndexRow>)? = null

    val size: Int get() = lock.read { alive.cardinality }

    // =====================================================================================================
    // writes
    // =====================================================================================================

    /** adds rows without locking; only for building an index that is not yet visible to readers */
    fun addForBulkLoad(row: IndexRow) {
        if (alive.contains(row.id)) {
            val ids = row.idSet()
            val runs = rebuildRuns(ids, listOf(row))
            removeIds(ids, collectIntersecting(ids))
            installRuns(runs)
            addRow(row, withRuns = false)
        } else {
            addRow(row, withRuns = true)
        }
    }

    /**
     * Independent parts of adding a batch of rows (ascending, unique ids beyond all ids added so far) that touch
     * disjoint structures and can therefore run in parallel (used by [IndexLoader]); not thread-safe otherwise.
     */
    internal fun bulkUnits(): List<(List<IndexRow>) -> Unit> {
        val units = ArrayList<(List<IndexRow>) -> Unit>()
        units += { rows ->
            rows.forEach {
                ensureCapacity(it.id)
                alive.add(it.id)
            }
        }
        for (i in columns.indices) {
            units += { rows ->
                for (row in rows) {
                    try {
                        columns[i].set(row.id, row.values.getOrNull(i))
                    } catch (e: RuntimeException) {
                        columns[i].clear(row.id)
                    }
                }
            }
        }
        for (seq in sequences.filterNotNull()) {
            check(!seq.hasLocalReference && !seq.gapRuns) { "bulk units after the bulk load was finished" }
            val seqIndex = seq.schema.index
            units += { rows ->
                for (row in rows) {
                    if (seqIndex in row.presentSequences) seq.addPresent(row.id)
                    forEachRun(row.missing) { s, start, end -> if (s === seq) seq.addMissingRun(row.id, start, end) }
                    for (insertion in row.insertions) {
                        val first = insertion.indexOf(':')
                        val second = insertion.indexOf(':', first + 1)
                        if (first < 0 || second < 0 || insertion.substring(0, first).toIntOrNull() != seqIndex) continue
                        val position = insertion.substring(first + 1, second).toIntOrNull() ?: continue
                        seq.addInsertion(row.id, position, insertion.substring(second + 1))
                    }
                }
            }
            // mutations by position range (positions are independent bitmaps / counters)
            val ranges = maxOf(1, seq.length / BULK_POSITIONS_PER_UNIT)
            for (r in 0 until ranges) {
                val from = 1 + r * seq.length / ranges
                val to = (r + 1) * seq.length / ranges
                units += { rows ->
                    for (row in rows) {
                        for (code in row.mutations) {
                            if (MutationCode.seqIndex(code) != seqIndex) continue
                            val position = MutationCode.position(code)
                            if (position in from..to) seq.addMutation(row.id, position, MutationCode.symbolIndex(code))
                        }
                    }
                }
            }
        }
        return units
    }

    /**
     * call after the last [addForBulkLoad]: picks each position's implicit symbol ([localReference]: see
     * [SequenceIndex.adaptLocalReference]; false keeps the reference everywhere), moves sparse gaps into runs
     * ([gapRuns]: see [SequenceIndex.storeSparseGapsAsRuns]; false keeps every gap a bitmap) and compresses
     * bitmaps
     */
    fun finishBulkLoad(dataVersion: Long, localReference: Boolean = true, gapRuns: Boolean = true) {
        indexPool.submit {
            sequences.filterNotNull().parallelStream().forEach {
                if (localReference) it.adaptLocalReference()
                if (gapRuns) it.storeSparseGapsAsRuns()
                it.runOptimize()
            }
            columns.parallelStream().forEach { it.runOptimize() }
        }.get()
        alive.runOptimize()
        permutations = buildPermutations()
        permutationStale = RoaringBitmap()
        this.dataVersion = dataVersion
        generation++
    }

    /** reads columns without the lock: only for the writer thread (the only one that mutates them) */
    private fun buildPermutations(): List<SortPermutation> = permutationKeys.map { (column, descending) ->
        val direction = if (descending) OrderDirection.DESCENDING else OrderDirection.ASCENDING
        val keys = SortKeys(listOf(column), listOf(direction))
        SortPermutation.of(column, descending, keys.sort(alive.toArray())) { keys.key(0, it) }
    }

    /** after [apply], on the writer thread: rebuilds the permutations off-lock once too many entries changed */
    private fun maintainPermutations() {
        if (permutationKeys.isEmpty()) return
        if (permutations.isNotEmpty() &&
            permutationStale.cardinality <= permutationRebuildThreshold(alive.cardinality)
        ) {
            return
        }
        val rebuilt = buildPermutations()
        lock.write {
            permutations = rebuilt
            permutationStale = RoaringBitmap()
        }
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
        val runs = rebuildRuns(toRemove, upserts)
        val prepared = System.nanoTime()
        val locked: Long
        lock.write {
            locked = System.nanoTime()
            if (!toRemove.isEmpty) removeIds(toRemove, intersecting)
            installRuns(runs)
            upserts.forEach { addRow(it, withRuns = false) }
            if (permutations.isNotEmpty()) permutationStale.or(changed)
            sequences.forEach { it?.invalidateCaches() }
            if (dataVersion != null) this.dataVersion = dataVersion
            generation++
        }
        val done = System.nanoTime()
        compactTouched()
        val compacted = System.nanoTime()
        maintainPermutations()
        return ApplyStats(
            upserts = upserts.size,
            removed = toRemove.cardinality,
            prepareMs = (prepared - started) / 1e6,
            waitForLockMs = (locked - prepared) / 1e6,
            lockedMs = (done - locked) / 1e6,
            compactMs = (compacted - done) / 1e6,
            permutationMs = (System.nanoTime() - compacted) / 1e6,
        )
    }

    data class ApplyStats(
        val upserts: Int,
        val removed: Int,
        val prepareMs: Double,
        val waitForLockMs: Double,
        val lockedMs: Double,
        /** re-compressing the changed bitmaps after the update (mostly outside the lock) */
        val compactMs: Double = 0.0,
        /** rebuilding the sort permutations when too many entries changed (outside the lock) */
        val permutationMs: Double = 0.0,
    )

    /**
     * Re-compresses the bitmaps the last [apply] changed, as the bulk load does for all bitmaps: copies are
     * optimised outside the lock and swapped in under short write-lock holds.
     */
    private fun compactTouched() {
        val install: (List<() -> Unit>) -> Unit = { swaps -> lock.write { swaps.forEach { it() } } }
        sequences.forEach { it?.compactTouched(install) }
        columns.forEach { it.compactTouched(install) }
        lock.write { alive.runOptimize() }
    }

    private fun IndexRow.idSet() = RoaringBitmap.bitmapOf(id)

    /** rebuilt run-table chunks of one sequence's missing and gap runs (null: unchanged) */
    private class RebuiltRuns(val missing: Map<Int, RunTable.Chunk>?, val gaps: Map<Int, RunTable.Chunk>?)

    /**
     * per sequence: rebuilt run-table chunks without [removed] ids' runs and with those of [rows], for missing
     * and gap runs (read-only)
     */
    private fun rebuildRuns(removed: RoaringBitmap, rows: List<IndexRow>): List<RebuiltRuns?> {
        val added = Array(sequences.size) { ArrayList<Int>() }
        val addedGaps = Array(sequences.size) { ArrayList<Int>() }
        for (row in rows) {
            forEachRun(row.missing) { seq, start, end -> added[seq.schema.index].addAll(listOf(row.id, start, end)) }
            if (sequences.none { it?.gapRuns == true }) continue
            for ((seqIndex, codes) in row.mutations.groupBy { MutationCode.seqIndex(it) }) {
                val seq = sequences.getOrNull(seqIndex) ?: continue
                val runs = seq.gapRunsOf(codes.toIntArray())
                for (r in 0 until runs.size / 2) {
                    addedGaps[seqIndex].addAll(
                        listOf(row.id, runs[2 * r], runs[2 * r + 1]),
                    )
                }
            }
        }
        return indexPool.submit<List<RebuiltRuns?>> {
            sequences.indices.toList().parallelStream().map { i ->
                val seq = sequences[i] ?: return@map null
                val touched = RoaringBitmap.intersects(seq.present, removed)
                val missing = if (added[i].isEmpty() && !touched) {
                    null
                } else {
                    seq.missing.table.rebuild(removed, seq.clampRuns(added[i].toIntArray()))
                }
                val gaps = if (addedGaps[i].isEmpty() && (!touched || seq.gaps.table.runCount == 0L)) {
                    null
                } else {
                    seq.gaps.table.rebuild(removed, addedGaps[i].toIntArray())
                }
                if (missing == null && gaps == null) null else RebuiltRuns(missing, gaps)
            }.toList()
        }.get()
    }

    private fun installRuns(runs: List<RebuiltRuns?>) {
        runs.forEachIndexed { i, rebuilt ->
            if (rebuilt == null) return@forEachIndexed
            rebuilt.missing?.let { sequences[i]!!.missing.table.install(it) }
            rebuilt.gaps?.let { sequences[i]!!.gaps.table.install(it) }
        }
    }

    private fun collectIntersecting(ids: RoaringBitmap): List<List<SequenceIndex.Removal>> = sequences.map { seq ->
        ArrayList<SequenceIndex.Removal>().also { seq?.collectIntersecting(ids, parallelPool, it) }
    }

    private fun removeIds(ids: RoaringBitmap, intersecting: List<List<SequenceIndex.Removal>>) {
        sequences.forEachIndexed { i, seq -> seq?.remove(ids, intersecting[i]) }
        forEachId(ids) { id -> columns.forEach { it.clear(id) } }
        alive.andNot(ids)
    }

    /** grows the id-indexed arrays in steps of [capacityStep], so that growth copies less under the write lock */
    private fun ensureCapacity(id: Int) {
        if (id < capacity) return
        var newCapacity = capacity.toLong()
        while (newCapacity <= id) newCapacity += capacityStep(newCapacity.toInt())
        val grown = minOf(newCapacity, MAX_ARRAY_SIZE.toLong()).toInt()
        columns.forEach { it.grow(grown) }
        capacity = grown
    }

    private fun addRow(row: IndexRow, withRuns: Boolean) {
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
        for (seqIndex in row.presentSequences) sequences.getOrNull(seqIndex)?.addPresent(id)
        // codes of sequences with a local reference or gap runs are added per sequence (addEntryMutations)
        var entryCodes: HashMap<Int, ArrayList<Int>>? = null
        for (code in row.mutations) {
            val seq = sequences.getOrNull(MutationCode.seqIndex(code)) ?: continue
            if (seq.hasLocalReference || seq.gapRuns) {
                val codes = (entryCodes ?: HashMap<Int, ArrayList<Int>>().also { entryCodes = it })
                codes.getOrPut(seq.schema.index) { ArrayList<Int>() }.add(code)
            } else {
                seq.addMutation(id, MutationCode.position(code), MutationCode.symbolIndex(code))
            }
        }
        val localReferenceRuns = HashMap<Int, ArrayList<Int>>()
        forEachRun(row.missing) { seq, start, end ->
            if (withRuns) seq.addMissingRun(id, start, end) else seq.addTransitions(id, start, end)
            if (seq.hasLocalReference) {
                localReferenceRuns.getOrPut(seq.schema.index) {
                    ArrayList<Int>()
                }.addAll(listOf(start, end))
            }
        }
        for (seq in sequences) {
            if (seq == null || !(seq.hasLocalReference || seq.gapRuns)) continue
            val runs = localReferenceRuns[seq.schema.index]
            seq.addEntryMutations(
                id,
                entryCodes?.get(seq.schema.index)?.toIntArray() ?: IntArray(0),
                runs?.toIntArray() ?: IntArray(0),
                (runs?.size ?: 0) / 2,
                seq.schema.index in row.presentSequences,
                withRuns,
            )
        }
        for (insertion in row.insertions) {
            val first = insertion.indexOf(':')
            val second = insertion.indexOf(':', first + 1)
            if (first < 0 || second < 0) continue
            val seq = sequences.getOrNull(insertion.substring(0, first).toIntOrNull() ?: continue) ?: continue
            val position = insertion.substring(first + 1, second).toIntOrNull() ?: continue
            seq.addInsertion(id, position, insertion.substring(second + 1))
        }
    }

    /** normalised (disjoint, sorted) missing runs of a row per sequence */
    private inline fun forEachRun(missing: IntArray, action: (SequenceIndex, Int, Int) -> Unit) {
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
            for (r in 0 until n) action(seq, runs[2 * r], runs[2 * r + 1])
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

        is Or -> evalOr(filter.children, mode, domain)

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

    /**
     * Equality children on the same string field become one in-list filter: one lookup per value for
     * value-indexed columns (a list of 200k accessions stays O(k)), one scan instead of one per value otherwise.
     */
    private fun evalOr(children: List<Filter>, mode: AmbiguityMode, domain: RoaringBitmap): RoaringBitmap {
        val byColumn = LinkedHashMap<StringColumn, MutableList<String?>>()
        val rest = ArrayList<Filter>()
        for (child in children) {
            val col = (child as? StringEquals)?.let { stringColumnOrNull(it.field) }
            if (col == null) rest.add(child) else byColumn.getOrPut(col) { ArrayList() }.add(child.value)
        }
        val parts = ArrayList<RoaringBitmap>(byColumn.size + rest.size)
        byColumn.forEach { (col, values) ->
            val value = values.singleOrNull()
            parts.add(
                when {
                    values.size > 1 -> col.inFilter(values, domain)
                    value == null -> col.isNullFilter(domain)
                    else -> col.equalsFilter(value, domain)
                },
            )
        }
        rest.forEach { parts.add(eval(it, mode, domain)) }
        return unionOf(parts)
    }

    private fun stringColumnOrNull(name: String): StringColumn? =
        (columnsByName[name] ?: schema.field(name)?.let { columnsByName[it.name] }) as? StringColumn

    /** 0 = answered from bitmaps or postings, 1 = scan, 2 = composite */
    private fun cost(filter: Filter): Int = when (filter) {
        is SymbolEquals, is HasMutation, is InsertionContains, is BooleanEquals, is IsNull, True -> 0

        is StringEquals, is LineageIn ->
            if ((columnsByName[filter.fieldName()] as? StringColumn)?.hasValueIndex == true) 0 else 1

        is StringRegex -> if ((columnsByName[filter.fieldName()] as? StringColumn)?.hasBitmaps == true) 0 else 1

        is IntEquals, is IntBetween, is FloatEquals, is FloatBetween, is DateEquals, is DateBetween -> 1

        // an accession list must run before the scans an And also holds (versionStatus), so these only visit k ids
        is Or -> filter.children.maxOfOrNull { cost(it) } ?: 0

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
        val implicit = seq.implicitSymbol(position).toByte()
        forEachId(RoaringBitmap.and(ids, seq.present)) { symbols[it] = implicit }
        seq.mutations[position]?.forEachIndexed { s, bm -> bm?.forEach { id: Int -> symbols[id] = s.toByte() } }
        seq.gapRunsAt(position)?.forEach { id: Int -> symbols[id] = seq.gapSymbol.toByte() }
        seq.missingAt(position).forEach { id: Int -> symbols[id] = seq.alphabet.missingIndex.toByte() }
        val chars = seq.alphabet.symbols
        return object : GroupKeySource {
            override val denseRange = chars.size + 1

            override fun key(id: Int): Long = (symbols[id] + 1).toLong()

            override fun decode(key: Long): Any? = if (key == 0L) null else chars[key.toInt() - 1].toString()
        }
    }

    private fun aggregateSingleDense(ids: RoaringBitmap, source: GroupKeySource): List<AggregatedRow> {
        if (ids.cardinality >= PARALLEL_MIN && source.denseRange <= MAX_PARALLEL_DENSE_RANGE) {
            return aggregateSingleDenseParallel(ids, source)
        }
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

    /** per-chunk counts and first-seen orders, merged in chunk (= id) order */
    private fun aggregateSingleDenseParallel(ids: RoaringBitmap, source: GroupKeySource): List<AggregatedRow> {
        val range = source.denseRange
        val parts = mapChunks(ids) { start, end ->
            val counts = LongArray(range)
            val order = IntArray(range)
            var groups = 0
            if (source is StringColumn) {
                forEachIdIn(ids, start, end) { id ->
                    val k = source.code(id) + 1
                    if (counts[k]++ == 0L) order[groups++] = k
                }
            } else {
                forEachIdIn(ids, start, end) { id ->
                    val k = source.key(id).toInt()
                    if (counts[k]++ == 0L) order[groups++] = k
                }
            }
            Triple(counts, order, groups)
        }
        val total = LongArray(range)
        val order = IntArray(range)
        var groups = 0
        for ((counts, partOrder, partGroups) in parts) {
            for (g in 0 until partGroups) {
                val k = partOrder[g]
                if (total[k] == 0L) order[groups++] = k
                total[k] += counts[k]
            }
        }
        return (0 until groups).map { g ->
            val k = order[g]
            AggregatedRow(listOf(source.decode(k.toLong())), total[k])
        }
    }

    /** groups by several dense keys: per-chunk hash maps of the composite key, merged in chunk order */
    private fun aggregateDenseParallel(
        ids: RoaringBitmap,
        sources: List<GroupKeySource>,
        radix: LongArray,
    ): List<AggregatedRow> {
        val m = sources.size
        val parts = mapChunks(ids) { start, end ->
            val index = LongIntMap(4096)
            val composites = LongArrayList()
            var counts = LongArray(64)
            forEachIdIn(ids, start, end) { id ->
                var composite = 0L
                for (f in 0 until m) composite = composite * radix[f] + sources[f].key(id)
                val g = index.getOrPut(composite, composites.size)
                if (g == composites.size) {
                    composites.add(composite)
                    if (g == counts.size) counts = counts.copyOf(g * 2)
                }
                counts[g]++
            }
            composites to counts
        }
        // merge in chunk (= id) order, which keeps the first-seen order
        val index = LongIntMap(16_384)
        val composites = LongArrayList()
        var totals = LongArray(1024)
        for ((partComposites, partCounts) in parts) {
            for (g in 0 until partComposites.size) {
                val composite = partComposites[g]
                val global = index.getOrPut(composite, composites.size)
                if (global == composites.size) {
                    composites.add(composite)
                    if (global == totals.size) totals = totals.copyOf(global * 2)
                }
                totals[global] += partCounts[g]
            }
        }
        // decoded values per dense key, shared between groups
        val decoded = Array(m) { f ->
            if (sources[f].denseRange <=
                1 shl 20
            ) {
                arrayOfNulls<Any?>(sources[f].denseRange)
            } else {
                null
            }
        }
        val decodedSet = Array(m) { f -> decoded[f]?.let { BooleanArray(it.size) } }
        return (0 until composites.size).map { g ->
            var c = composites[g]
            val tuple = LongArray(m)
            for (f in m - 1 downTo 0) {
                tuple[f] = c % radix[f]
                c /= radix[f]
            }
            val values = List(m) { f ->
                val cache = decoded[f]
                val k = tuple[f].toInt()
                if (cache == null) {
                    sources[f].decode(tuple[f])
                } else {
                    if (!decodedSet[f]!![k]) {
                        cache[k] = sources[f].decode(tuple[f])
                        decodedSet[f]!![k] = true
                    }
                    cache[k]
                }
            }
            AggregatedRow(values, totals[g])
        }
    }

    /** numeric keys (int, date, iso week) spanning a small range over [ids] become dense keys */
    private fun densified(source: GroupKeySource, ids: RoaringBitmap): GroupKeySource {
        if (source.denseRange > 0) return source
        val bounds = mapChunks(ids) { start, end ->
            var lo = Long.MAX_VALUE
            var hi = Long.MIN_VALUE
            forEachIdIn(ids, start, end) { id ->
                val k = source.key(id)
                if (k != Long.MIN_VALUE) {
                    if (k < lo) lo = k
                    if (k > hi) hi = k
                }
            }
            longArrayOf(lo, hi)
        }
        var min = bounds.minOfOrNull { it[0] } ?: Long.MAX_VALUE
        val max = bounds.maxOfOrNull { it[1] } ?: Long.MIN_VALUE
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
        if (n >= PARALLEL_MIN && sources.all { it.denseRange > 0 }) {
            val denseRadix = LongArray(m) { sources[it].denseRange.toLong() }
            var denseProduct = 1.0
            denseRadix.forEach { denseProduct *= it.toDouble() }
            if (denseProduct < 9.0e18) return aggregateDenseParallel(ids, sources, denseRadix)
        }
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
        if (random == null && orderBy.isNotEmpty() && usePermutations && n.toLong() * 64 >= alive.cardinality) {
            val permutation = permutations.firstOrNull { it.column === keys.cols[0] }
            if (permutation != null) {
                selectByPermutation(permutation, keys, orderBy, live, from, limit)?.let { return@read it }
            }
        }
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

    /**
     * [select] for a sort whose first key is [permutation]'s column: the first offset + limit ids of the walk
     * (skipping stale ids), sorted together with the stale ones in the selection; identical to the sort because it
     * sorts a set that contains the first offset + limit ids of the full order. Null (sort as usual) if the walk
     * would collect too many candidates (a long run of equal first keys under a multi-key sort) or visit far more
     * positions than a selection spread evenly over the order would need (one correlated with the key).
     */
    private fun selectByPermutation(
        permutation: SortPermutation,
        keys: SortKeys,
        orderBy: List<OrderByField>,
        live: RoaringBitmap,
        from: Int,
        limit: Int?,
    ): IntArray? {
        val n = live.cardinality
        val k = if (limit == null) n else minOf(n.toLong(), from.toLong() + limit).toInt()
        if (k <= from) return IntArray(0)
        val stale = permutationStale.takeIf { !it.isEmpty }
        val tail = stale?.let { RoaringBitmap.and(live, it) }?.takeIf { !it.isEmpty }
        val forward = (orderBy[0].direction == OrderDirection.DESCENDING) == permutation.descending
        val wholeRuns = orderBy.size > 1
        val maxCandidates = if (limit == null) n else (4L * k + 4096).coerceAtMost(n.toLong()).toInt()
        val maxSteps = 4L * k * alive.cardinality / n + 4096
        val candidates =
            permutation.candidates(live, stale, k, forward, wholeRuns, maxCandidates, maxSteps) ?: return null
        val ordered = if (tail == null && !wholeRuns) {
            candidates
        } else {
            val all = IntArray(candidates.size + (tail?.cardinality ?: 0))
            System.arraycopy(candidates, 0, all, 0, candidates.size)
            var i = candidates.size
            tail?.forEach { id: Int -> all[i++] = id }
            all.sort()
            keys.sort(all)
        }
        return ordered.copyOfRange(minOf(from, ordered.size), minOf(k, ordered.size))
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

    override fun mutations(ids: RoaringBitmap, type: SequenceType, minProportion: Double): List<MutationRow> {
        smallSetRows(ids)?.let { return SmallSetCounts.mutations(schema, it, type, minProportion) }
        return bitmapMutations(ids, type, minProportion, complementRows(ids))
    }

    /** rows of alive \ ids from [rowLoader] if that complement is small (read outside the lock) */
    private fun complementRows(ids: RoaringBitmap): List<IndexRow>? {
        val loader = rowLoader ?: return null
        val complement = lock.read {
            if (alive.cardinality - RoaringBitmap.andCardinality(ids, alive) > COMPLEMENT_ROWS_LIMIT) return null
            RoaringBitmap.andNot(alive, ids)
        }
        if (complement.isEmpty) return null
        return loader(complement.toArray().asList())
    }

    /** rows of [ids] from [rowLoader] if the set is small enough to count directly (read outside the lock) */
    private fun smallSetRows(ids: RoaringBitmap): List<IndexRow>? {
        val loader = rowLoader ?: return null
        if (ids.cardinality > SMALL_SET_LIMIT) return null
        val live = lock.read { RoaringBitmap.and(ids, alive) }
        if (live.isEmpty) return emptyList()
        return loader(live.toArray().asList())
    }

    /** per-sequence inputs of the block tasks */
    private class MutationInput(
        val seq: SequenceIndex,
        val filtered: RoaringBitmap,
        val n: Int,
        val cardinalities: IntArray?,
        val missing: IntArray,
        /** counts over ids per position of the gaps stored as runs; null if the sequence stores none */
        val gaps: IntArray?,
        /** present \ ids when counting as "all minus complement" (cardinalities = counts over all present) */
        val complement: RoaringBitmap?,
        /** counts of the complement per (position * alphabet size + symbol), from its rows */
        val complementCounts: LongIntMap?,
    )

    private fun bitmapMutations(
        ids: RoaringBitmap,
        type: SequenceType,
        minProportion: Double,
        complementRows: List<IndexRow>? = null,
    ): List<MutationRow> = lock.read {
        val seqs = if (type == SequenceType.NUCLEOTIDE) schema.nucleotideSequences else schema.genes
        fun prepare(index: Int): MutationInput? {
            val seq = sequence(index)
            val filtered = forIntersections(RoaringBitmap.and(ids, seq.present))
            val n = filtered.cardinality
            if (n == 0) return null
            val complementSize = seq.present.cardinality - n
            val gapRuns = seq.gapRuns
            if (complementSize == 0) {
                val gaps = if (gapRuns) seq.gaps.countsAll() else null
                return MutationInput(seq, filtered, n, seq.mutationCounts, seq.missingCountsAll(), gaps, null, null)
            }
            if (complementRows != null) {
                val fromRows = complementFromRows(seq, filtered, complementRows)
                if (fromRows == null) complementRowFallbacks.incrementAndGet()
                fromRows?.let { (codeCounts, complementMissing, complementGaps) ->
                    val all = seq.missingCountsAll()
                    val missing = IntArray(all.size) { all[it] - complementMissing[it] }
                    val gaps = if (gapRuns) {
                        val allGaps = seq.gaps.countsAll()
                        IntArray(allGaps.size) { allGaps[it] - complementGaps[it] }
                    } else {
                        null
                    }
                    return MutationInput(seq, filtered, n, seq.mutationCounts, missing, gaps, null, codeCounts)
                }
            }
            if (complementSize <= n * COMPLEMENT_FRACTION) {
                // almost all entries (e.g. "latest versions" with a few revisions/revocations): counts over all
                // present entries minus the counts over the (small) complement
                val complement = forIntersections(RoaringBitmap.andNot(seq.present, filtered))
                fun allMinusComplement(runs: RunIndex): IntArray {
                    val all = runs.countsAll()
                    val ofComplement = runs.countsOver(complement)
                    return IntArray(all.size) { all[it] - ofComplement[it] }
                }
                val missing = allMinusComplement(seq.missing)
                val gaps = if (gapRuns) allMinusComplement(seq.gaps) else null
                return MutationInput(seq, filtered, n, seq.mutationCounts, missing, gaps, complement, null)
            }
            val gaps = if (gapRuns) seq.gaps.countsOver(filtered) else null
            return MutationInput(seq, filtered, n, null, seq.missingCountsOver(filtered), gaps, null, null)
        }
        val parallel = parallelMutations
        val inputs: List<MutationInput?> = if (parallel && seqs.size > 1) {
            parallelPool.submit<List<MutationInput?>> {
                seqs.parallelStream().map { prepare(it.index) }.toList()
            }.get()
        } else {
            seqs.map { prepare(it.index) }
        }
        // all (sequence, block) tasks of all sequences in one parallel pass, results in (sequence, block) order
        val tasks = ArrayList<Pair<MutationInput, Int>>()
        inputs.filterNotNull().forEach { input ->
            for (k in 0..(input.seq.length shr SequenceIndex.BLOCK_SHIFT)) tasks.add(input to k)
        }
        val compute = { task: Pair<MutationInput, Int> ->
            val input = task.first
            mutationsInBlock(
                input.seq,
                task.second,
                input.filtered,
                input.n,
                input.cardinalities,
                input.complement,
                input.complementCounts,
                input.missing,
                input.gaps,
                minProportion,
            )
        }
        val allFull = inputs.all { it == null || (it.cardinalities != null && it.complement == null) }
        val perTask: List<List<MutationRow>> = if (!parallel || allFull) {
            tasks.map(compute)
        } else {
            parallelPool.submit<List<List<MutationRow>>> { tasks.parallelStream().map(compute).toList() }.get()
        }
        perTask.flatten()
    }

    /**
     * Code counts (position * alphabet size + symbol), per-position missing counts and per-position counts of
     * gaps stored as runs of the complement present \ [filtered], from the complement's projection [rows]; null
     * if the rows do not match the index (an entry changed after the index was updated), in which case the
     * bitmaps are used ([complementRowFallbacks]).
     */
    private fun complementFromRows(
        seq: SequenceIndex,
        filtered: RoaringBitmap,
        rows: List<IndexRow>,
    ): Triple<LongIntMap, IntArray, IntArray>? {
        val seqIndex = seq.schema.index
        val size = seq.alphabet.size
        val complementSize = seq.present.cardinality - filtered.cardinality
        val counts = LongIntMap()
        val diff = IntArray(seq.length + 2)
        val gapDiff = IntArray(seq.length + 2)
        var matched = 0
        for (row in rows) {
            val rowPresent = seqIndex in row.presentSequences
            if (rowPresent != seq.present.contains(row.id)) return null
            if (!rowPresent || filtered.contains(row.id)) continue
            matched++
            val codes = row.mutations.filter { MutationCode.seqIndex(it) == seqIndex }.distinct()
            for (code in codes) {
                val position = MutationCode.position(code)
                val symbol = MutationCode.symbolIndex(code)
                if (position < 1 || position > seq.length || symbol >= size) continue
                // the implicit symbol is not stored (see SequenceIndex.localReference)
                if (symbol == seq.implicitSymbol(position)) continue
                if (symbol == seq.gapSymbol && seq.gapAsRun(position)) continue
                if (seq.mutations[position]?.get(symbol)?.contains(row.id) != true) return null
                counts.increment((position * size + symbol).toLong())
            }
            val gapRuns = seq.gapRunsOf(codes.toIntArray())
            for (r in 0 until gapRuns.size / 2) {
                gapDiff[gapRuns[2 * r]]++
                gapDiff[gapRuns[2 * r + 1]]--
            }
            val runs = ArrayList<Int>()
            forEachRun(row.missing) { s, start, end ->
                val from = maxOf(1, start)
                val until = minOf(seq.length + 1, end)
                if (s === seq && from < until) {
                    diff[from]++
                    diff[until]--
                    runs.addAll(listOf(start, end))
                }
            }
            if (seq.hasLocalReference) {
                // the reference is stored where it is not the implicit symbol: present, not missing, no code
                val coded = codes.map { MutationCode.position(it) }.toIntArray().also { it.sort() }
                var run = 0
                for (position in seq.localReferencePositions) {
                    while (run < runs.size / 2 && runs[2 * run + 1] <= position) run++
                    if (run < runs.size / 2 && runs[2 * run] <= position) continue
                    if (java.util.Arrays.binarySearch(coded, position) >= 0) continue
                    val ref = seq.reference(position)
                    if (seq.mutations[position]?.get(ref)?.contains(row.id) != true) return null
                    counts.increment((position * size + ref).toLong())
                }
            }
        }
        if (matched != complementSize) return null
        fun cumulative(d: IntArray): IntArray {
            val out = IntArray(seq.length + 1)
            var running = 0
            for (p in 1..seq.length) {
                running += d[p]
                out[p] = running
            }
            return out
        }
        return Triple(counts, cumulative(diff), cumulative(gapDiff))
    }

    private fun threshold(coverage: Long, minProportion: Double): Long =
        if (minProportion == 0.0) 0 else ceil(coverage.toDouble() * minProportion).toLong() - 1

    /**
     * Mutations of the positions of block [k]. [missing]: exact missing counts per position over [ids], which
     * give an exact lower bound of the coverage
     * (n - missing - all ambiguous codes at p); symbols whose total count cannot exceed the threshold at that
     * coverage are skipped without touching their bitmaps (for minProportion > 0 that is most of them).
     * [gaps]: exact counts over [ids] of the gaps stored as runs (0 where gaps are bitmaps).
     */
    private fun mutationsInBlock(
        seq: SequenceIndex,
        k: Int,
        ids: RoaringBitmap,
        n: Int,
        cardinalities: IntArray?,
        complement: RoaringBitmap?,
        complementCounts: LongIntMap?,
        missing: IntArray,
        gaps: IntArray?,
        minProportion: Double,
    ): List<MutationRow> {
        // count over all present entries, minus the complement's if counting "all minus complement"
        fun countAll(index: Int, bm: RoaringBitmap): Long {
            val all = cardinalities!![index].toLong()
            if (complementCounts != null) return all - maxOf(0, complementCounts.get(index.toLong()))
            return if (complement == null || all == 0L) all else all - RoaringBitmap.andCardinality(complement, bm)
        }
        val allCounts = seq.mutationCounts
        val shift = SequenceIndex.BLOCK_SHIFT
        val first = maxOf(1, k shl shift)
        val last = minOf(seq.length, (k shl shift) + SequenceIndex.BLOCK_SIZE - 1)
        if (first > last) return emptyList()
        val alphabet = seq.alphabet
        val validMask = alphabet.validMutationMask
        val symbolCount = alphabet.size
        val rows = ArrayList<MutationRow>()
        val counts = LongArray(symbolCount)
        val gapSymbol = seq.gapSymbol
        for (p in first..last) {
            val gapRuns = gaps?.get(p)?.toLong() ?: 0L
            val implicit = seq.implicitSymbol(p)
            if (implicit != seq.reference(p)) {
                // the reference is stored and the implicit symbol derived: count every stored symbol exactly
                val stored = seq.mutations[p]
                var storedSum = 0L
                for (s in 0 until symbolCount) {
                    val bm = stored?.get(s)
                    counts[s] = when {
                        bm == null -> 0L
                        cardinalities != null -> countAll(p * symbolCount + s, bm)
                        else -> RoaringBitmap.andCardinality(ids, bm).toLong()
                    }
                    storedSum += counts[s]
                }
                // gaps stored as runs have no bitmap here, and are never the implicit symbol
                counts[gapSymbol] += gapRuns
                storedSum += gapRuns
                counts[implicit] = maxOf(0L, n - missing[p] - storedSum)
                var coverage = 0L
                for (s in 0 until symbolCount) if (validMask and (1 shl s) != 0) coverage += counts[s]
                emitMutations(seq, p, counts, coverage, minProportion, rows)
                continue
            }
            val perSymbol = seq.mutations[p]
            if (perSymbol == null && gapRuns == 0L) continue
            val ref = seq.reference(p)
            val refValid = validMask and (1 shl ref) != 0
            val missingAtP = missing[p].toLong()
            var pruneBelow = -1L
            if ((cardinalities == null || complement != null) && minProportion > 0 && refValid) {
                var invalidAll = 0L
                for (s in 0 until symbolCount) {
                    if (validMask and (1 shl s) == 0) invalidAll += allCounts[p * symbolCount + s]
                }
                pruneBelow = threshold(maxOf(n - missingAtP - minOf(n.toLong(), invalidAll), 1), minProportion)
            }
            var validSum = 0L
            var validMax = 0L
            // valid symbols first: the (many) ambiguity-code bitmaps only matter where something is reportable
            for (s in 0 until symbolCount) {
                if (validMask and (1 shl s) == 0) continue
                val bm = perSymbol?.get(s)
                val c = when {
                    s == gapSymbol && gapRuns > 0 -> gapRuns
                    bm == null -> 0L
                    s != ref && minOf(n, allCounts[p * symbolCount + s]).toLong() <= pruneBelow -> 0L
                    cardinalities != null -> countAll(p * symbolCount + s, bm)
                    else -> RoaringBitmap.andCardinality(ids, bm).toLong()
                }
                counts[s] = c
                validSum += c
                if (s != ref && c > validMax) validMax = c
            }
            if (validMax == 0L) continue
            if (!refValid) {
                // the (implicit) reference count is not part of the coverage
                emitMutations(seq, p, counts, validSum, minProportion, rows)
                continue
            }
            var invalid = 0L
            for (s in 0 until symbolCount) {
                if (validMask and (1 shl s) != 0) continue
                val bm = perSymbol?.get(s) ?: continue
                invalid += if (cardinalities != null) {
                    countAll(p * symbolCount + s, bm)
                } else {
                    RoaringBitmap.andCardinality(ids, bm).toLong()
                }
            }
            emitMutations(seq, p, counts, n - invalid - missingAtP, minProportion, rows)
        }
        return rows
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

    override fun insertions(ids: RoaringBitmap, type: SequenceType): List<InsertionRow> {
        smallSetRows(ids)?.let { return SmallSetCounts.insertions(schema, it, type) }
        return bitmapInsertions(ids, type)
    }

    private fun bitmapInsertions(ids: RoaringBitmap, type: SequenceType): List<InsertionRow> = lock.read {
        val seqs = if (type == SequenceType.NUCLEOTIDE) schema.nucleotideSequences else schema.genes
        val result = ArrayList<InsertionRow>()
        for (seqSchema in seqs) {
            val seq = sequence(seqSchema.index)
            val filtered = RoaringBitmap.and(ids, seq.present)
            if (filtered.isEmpty) continue
            val complementSize = seq.present.cardinality - filtered.cardinality
            val complement = if (complementSize in 1..(filtered.cardinality * COMPLEMENT_FRACTION).toInt()) {
                RoaringBitmap.andNot(seq.present, filtered)
            } else {
                null
            }
            for (position in seq.insertions.keys.sorted()) {
                val bySymbols = seq.insertions.getValue(position)
                for (symbols in bySymbols.keys.sorted()) {
                    val bm = bySymbols.getValue(symbols)
                    val count = when {
                        complementSize == 0 -> bm.longCardinality
                        complement != null -> bm.longCardinality - RoaringBitmap.andCardinality(complement, bm)
                        else -> RoaringBitmap.andCardinality(filtered, bm).toLong()
                    }
                    if (count > 0) result.add(InsertionRow(seqSchema.index, position, symbols, count))
                }
            }
        }
        result
    }

    // =====================================================================================================
    // diagnostics
    // =====================================================================================================

    /** for diagnostics and benchmarks */
    internal fun sequenceIndex(index: Int): SequenceIndex = sequence(index)

    /** per sequence: number of mutation bitmaps, their containers, and missing runs */
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
            seq.schema.name to listOf(bitmaps, containers, seq.missing.table.runCount)
        }
    }

    /** approximate heap usage of the index structures in bytes, per component */
    fun memoryUsage(): Map<String, Long> = lock.read {
        val usage = LinkedHashMap<String, Long>()
        usage["alive"] = heapBytes(alive)
        permutations.forEach { usage["sortPermutation:${it.column.field.name}"] = it.memoryBytes() }
        if (permutationKeys.isNotEmpty()) usage["sortPermutationStale"] = heapBytes(permutationStale)
        columns.forEach { usage["metadata:${it.field.name}"] = it.memoryBytes() }
        sequences.filterNotNull().forEach { usage["sequence:${it.schema.name}"] = it.memoryBytes() }
        usage["regexCache"] = regexCache.bytes
        usage
    }

    companion object {
        /** Loculus's accession field; with the primary key (accessionVersion) it is looked up by value */
        const val ACCESSION_FIELD = "accession"

        /**
         * complements whose rows did not match the index, so that their counts came from bitmaps instead (for
         * tests: the fast path must be taken whenever the rows are current)
         */
        internal val complementRowFallbacks = java.util.concurrent.atomic.AtomicLong()

        /** [select] walks a sort permutation where one matches (switchable for tests and benchmarks) */
        @Volatile internal var usePermutations = true

        /** stale entries past which the sort permutations are rebuilt (each select sorts the stale ones it selects) */
        internal fun permutationRebuildThreshold(size: Int): Int = (size / 64).coerceIn(1024, 20_000)

        /** filtered mutation counting runs position blocks in parallel (switchable for benchmarks) */
        @Volatile internal var parallelMutations = true

        /**
         * mutations / insertions over at most this many ids are counted from their rows (see [rowLoader]).
         * Loading rows costs ~0.04 ms/id on local Postgres and 0.2-0.4 ms/id on real data, the bitmap path a flat
         * 1-3 ms (60k-1M entries), so rows only pay off for very small sets such as a single sequence's page.
         */
        const val SMALL_SET_LIMIT = 20

        /** a complement (alive \ ids) of at most this many ids is counted from its rows (see [complementRows]) */
        const val COMPLEMENT_ROWS_LIMIT = 100

        /** mutations / insertions over ids covering all but at most this fraction are counted as all - complement */
        private const val COMPLEMENT_FRACTION = 0.2
        private const val BULK_POSITIONS_PER_UNIT = 4000
        private const val MAX_DENSE_RANGE = 1L shl 20
        private const val MAX_PARALLEL_DENSE_RANGE = 1 shl 16
        private const val MAX_DIRECT_GROUP_TABLE = (1 shl 22).toDouble()
        private val parallelPool: ForkJoinPool get() = indexPool

        /**
         * headroom above [capacity] ids: 1/16 of it, at least 4096 and at most 1M ids (the id-indexed arrays cost
         * ~10-150 B per id, so 1M ids is ~0.15 GB, where growing by half at 20M entries held 10M ids)
         */
        internal fun capacityStep(capacity: Int): Int = (capacity / 16).coerceIn(4096, 1 shl 20)

        /** builds an index from [rows] (any id order; ascending is fastest) */
        fun build(
            schema: QuerySchema,
            rows: Iterable<IndexRow>,
            dataVersion: Long = 0,
            localReference: Boolean = true,
            gapRuns: Boolean = true,
        ): InMemoryOrganismIndex {
            val index = InMemoryOrganismIndex(schema)
            rows.forEach { index.addForBulkLoad(it) }
            index.finishBulkLoad(dataVersion, localReference, gapRuns)
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

private fun LongIntMap.increment(key: Long) = put(key, getOrPut(key, 0) + 1)
