package org.loculus.backend.query.index

/** Provides the live in-memory index per organism (null while not yet built / organism not configured). */
interface OrganismIndexProvider {
    fun get(organism: String): OrganismIndex?

    /**
     * The index to answer a request from. Unlike [get], this may block (bounded) while the organism's index is being
     * loaded or reloaded, so background work must use [get].
     */
    fun forRequest(organism: String): IndexLookup = get(organism)?.let { IndexLookup.Ready(it) }
        ?: IndexLookup.Unavailable("The query engine for $organism is not available yet. Please try again later.")
}

sealed interface IndexLookup {
    class Ready(val index: OrganismIndex) : IndexLookup

    /** [reason] is the message of the 503 */
    class Unavailable(val reason: String) : IndexLookup
}
