package org.loculus.backend.query.request

import org.loculus.backend.query.schema.QuerySchema

/**
 * Parses raw LAPIS request parameters into a [QueryRequest].
 *
 * [params]: parameter name -> values, as normalised by the controller from either
 *  - GET query / form-urlencoded POST: every value a String (repeated keys = several values), or
 *  - JSON POST body: String, Number, Boolean, null, List (flattened into values), or Map (orderBy objects).
 * [pathSequenceName]: the {segment}/{gene} path variable of sequence routes, if any.
 * [isGet]: true for GET / form requests (enables comma-splitting of list parameters like LAPIS).
 */
object LapisRequestParser {
    fun parse(
        schema: QuerySchema,
        endpoint: Endpoint,
        pathSequenceName: String?,
        params: Map<String, List<Any?>>,
        isGet: Boolean,
    ): QueryRequest = TODO("implemented by the request parser")
}
