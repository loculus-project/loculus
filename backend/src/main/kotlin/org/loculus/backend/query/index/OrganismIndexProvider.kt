package org.loculus.backend.query.index

/** Provides the live in-memory index per organism (null while not yet built / organism not configured). */
interface OrganismIndexProvider {
    fun get(organism: String): OrganismIndex?
}
