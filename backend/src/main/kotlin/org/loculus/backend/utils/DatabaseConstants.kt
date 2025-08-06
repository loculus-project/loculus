package org.loculus.backend.utils

object DatabaseConstants {
    const val POSTGRESQL_PARAMETER_LIMIT = 65_535
    const val SAFE_CHUNK_SIZE = 10_000
}

fun <T> Collection<T>.processInDatabaseSafeChunks(action: (List<T>) -> Unit) {
    this.chunked(DatabaseConstants.SAFE_CHUNK_SIZE).forEach(action)
}

/**
  * PostgreSQL only supports 65,535 query parameters per query. This function chunks a list to avoid sending more parameters than allowed.
  * @param numberQueryParametersPerEntry The number of query parameters that each entry in the list would use. The default of 6 should be safe for many requests. 
  */
fun <T, R> Collection<T>.chunkedForDatabase(transform: (List<T>) -> List<R>, numberQueryParametersPerEntry = 6): List<R> {
    if (isEmpty()) return emptyList()
    return chunked(floor((POSTGRESQL_PARAMETER_LIMIT - 100)/ numberQueryParametersPerEntry)).flatMap(transform)
}
