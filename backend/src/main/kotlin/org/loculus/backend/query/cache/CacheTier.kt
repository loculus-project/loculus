package org.loculus.backend.query.cache

import java.util.TreeSet
import java.util.concurrent.atomic.AtomicLong

/** one cached response in one tier */
class TierEntry(
    val key: CacheKey,
    val response: CachedResponse,
    val payload: Payload,
    /** what the miss cost ([MissCost]) */
    val cost: MissCost,
    /** [cost] weighted into one number (ms-equivalent), which ranks the entry */
    val costMs: Double,
    /** bytes charged to the tier's budget */
    val size: Long,
    var frequency: Int,
    /** epoch ms at which the response was produced (the miss), for the maximum age */
    val createdAtMs: Long,
) {
    var priority: Double = 0.0
        internal set
    internal val seq = SEQ.incrementAndGet()

    /** disk entries are admitted before their file is written; lookups skip them until then */
    @Volatile
    var ready: Boolean = true
        internal set

    private companion object {
        val SEQ = AtomicLong()
    }
}

sealed interface Admission {
    /** [evicted]: entries removed to make room (their payloads are the caller's to demote or delete) */
    class Admitted(val entry: TierEntry, val evicted: List<TierEntry>) : Admission

    class Rejected(val reason: String) : Admission
}

/**
 * A byte-budgeted set of entries ordered by GreedyDual-Size-Frequency priority
 * `P = L + frequency × cost_ms / size_MB`. [inflation] (L) is raised to the priority of each evicted entry, so
 * entries that stop being hit age out relative to new ones.
 *
 * When the tier is full, a candidate is admitted only if its priority exceeds that of every entry it would displace:
 * the weakest entry's priority is the tier's effective threshold. Exact ordering (a TreeSet under one lock): entries
 * number in the tens of thousands and hits in the tens per second, so the lock is uncontended.
 */
class CacheTier(val name: String, val budgetBytes: Long, val maxEntryBytes: Long) {
    private val lock = Any()
    private val entries = HashMap<String, TierEntry>()
    private val byOrganism = HashMap<String, MutableSet<TierEntry>>()
    private val order = TreeSet(compareBy<TierEntry>({ it.priority }, { it.seq }))
    private var used = 0L
    private var inflation = 0.0

    val enabled get() = budgetBytes > 0

    fun usedBytes(): Long = synchronized(lock) { used }

    fun size(): Int = synchronized(lock) { entries.size }

    /**
     * the priority a new entry has to exceed to displace anything: the weakest entry's, once the tier is full
     * (less free space than its largest admissible entry); 0 before
     */
    fun threshold(): Double = synchronized(lock) {
        if (budgetBytes - used < maxEntryBytes && order.isNotEmpty()) order.first().priority else 0.0
    }

    fun priorityOf(frequency: Int, costMs: Double, size: Long): Double = synchronized(lock) {
        score(frequency, costMs, size)
    }

    private fun score(frequency: Int, costMs: Double, size: Long) =
        inflation + frequency * costMs.coerceAtLeast(MIN_COST_MS) / (size.coerceAtLeast(1) / 1e6)

    /** the ready entry for [key], counted as a hit (priority raised); null if absent */
    fun hit(key: CacheKey): TierEntry? = synchronized(lock) {
        val entry = entries[key.id] ?: return null
        if (!entry.ready) return null
        order.remove(entry)
        entry.frequency++
        entry.priority = score(entry.frequency, entry.costMs, entry.size)
        order.add(entry)
        entry
    }

    fun peek(key: CacheKey): TierEntry? = synchronized(lock) { entries[key.id]?.takeIf { it.ready } }

    fun admit(candidate: TierEntry): Admission = synchronized(lock) {
        if (!enabled) return Admission.Rejected("disabled")
        if (candidate.size > maxEntryBytes) return Admission.Rejected("too_large")
        if (entries.containsKey(candidate.key.id)) return Admission.Rejected("present")
        candidate.priority = score(candidate.frequency, candidate.costMs, candidate.size)
        val victims = ArrayList<TierEntry>()
        var free = budgetBytes - used
        if (free < candidate.size) {
            for (entry in order) {
                if (entry.priority >= candidate.priority) return Admission.Rejected("below_threshold")
                victims.add(entry)
                free += entry.size
                if (free >= candidate.size) break
            }
            if (free < candidate.size) return Admission.Rejected("below_threshold")
        }
        victims.forEach(::removeLocked)
        victims.lastOrNull()?.let { inflation = maxOf(inflation, it.priority) }
        entries[candidate.key.id] = candidate
        byOrganism.getOrPut(candidate.key.organism) { HashSet() }.add(candidate)
        order.add(candidate)
        used += candidate.size
        Admission.Admitted(candidate, victims)
    }

    /** removes [entry] if it is still the one stored under its key */
    fun remove(entry: TierEntry): Boolean = synchronized(lock) {
        if (entries[entry.key.id] !== entry) return false
        removeLocked(entry)
        true
    }

    fun markReady(entry: TierEntry): Boolean = synchronized(lock) {
        if (entries[entry.key.id] !== entry) return false
        entry.ready = true
        true
    }

    /** removes all entries of [organism] with another content token than [currentToken] */
    fun dropStale(organism: String, currentToken: String): List<TierEntry> = synchronized(lock) {
        val stale = byOrganism[organism]?.filter { it.key.contentToken != currentToken } ?: return emptyList()
        stale.forEach(::removeLocked)
        stale
    }

    /** removes all entries created before [createdBeforeMs] */
    fun dropOlderThan(createdBeforeMs: Long): List<TierEntry> = synchronized(lock) {
        val old = entries.values.filter { it.createdAtMs < createdBeforeMs }
        old.forEach(::removeLocked)
        old
    }

    fun organisms(): Set<String> = synchronized(lock) { byOrganism.keys.toSet() }

    private fun removeLocked(entry: TierEntry) {
        entries.remove(entry.key.id)
        order.remove(entry)
        byOrganism[entry.key.organism]?.let {
            it.remove(entry)
            if (it.isEmpty()) byOrganism.remove(entry.key.organism)
        }
        used -= entry.size
    }

    private companion object {
        /** a hit is never worth nothing: keeps near-free responses ordered by frequency and size */
        const val MIN_COST_MS = 0.01
    }
}
