package org.loculus.backend.utils

object DatabaseConstants {
    const val POSTGRESQL_PARAMETER_LIMIT = 65_535
    const val SAFE_CHUNK_SIZE = 10_000
}

fun <T> Collection<T>.processInDatabaseSafeChunks(action: (List<T>) -> Unit) {
    this.chunked(DatabaseConstants.SAFE_CHUNK_SIZE).forEach(action)
}

fun <T, R> Collection<T>.chunkedForDatabase(transform: (List<T>) -> List<R>): List<R> {
    if (isEmpty()) return emptyList()
    return chunked(DatabaseConstants.SAFE_CHUNK_SIZE).flatMap(transform)
}