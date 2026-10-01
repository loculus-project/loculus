package org.loculus.backend.query.index

import org.loculus.backend.query.filter.Filter
import org.loculus.backend.query.request.OrderByField
import org.loculus.backend.query.request.RandomOrder
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.schema.SequenceType
import org.roaringbitmap.RoaringBitmap

/** one group of /aggregated: values in the order of the requested fields */
data class AggregatedRow(val values: List<Any?>, val count: Long)

data class MutationRow(
    val sequenceIndex: Int,
    val position: Int,
    val symbolFrom: Char,
    val symbolTo: Char,
    val count: Long,
    val coverage: Long,
) {
    val proportion: Double get() = count.toDouble() / coverage.toDouble()
}

data class InsertionRow(val sequenceIndex: Int, val position: Int, val insertedSymbols: String, val count: Long)

/**
 * In-memory index of one organism's projection. Thread-safe for concurrent readers; updated by the
 * changelog tailer. Values returned for metadata fields are typed like LAPIS JSON output:
 * String, Long, Double, Boolean, or dates as 'YYYY-MM-DD' Strings; null for missing.
 *
 * Entry ids are the projection ids (query_entries.id).
 */
interface OrganismIndex {
    val schema: QuerySchema

    /** epoch seconds of the last change applied (LAPIS dataVersion) */
    val dataVersion: Long

    /**
     * Opaque token that changes whenever the index's content changes, and is never shared by two index instances.
     * Unlike [dataVersion] it is updated inside the write that changes the content, so a request that reads it
     * before and after executing and sees the same value was answered from that one state (response ETags).
     */
    val contentToken: String get() = dataVersion.toString()

    /** ids of all live entries matching [filter] */
    fun evaluate(filter: Filter): RoaringBitmap

    /** group [ids] by [fields]; empty [fields] -> a single row with the total count. Group order = first seen. */
    fun aggregate(ids: RoaringBitmap, fields: List<String>): List<AggregatedRow>

    /**
     * ids in output order for /details and sequence endpoints: stable sort by [orderBy] (metadata fields,
     * nulls smallest), then [offset], then shuffle if [random], then [limit]. Without orderBy/random: id order.
     */
    fun select(
        ids: RoaringBitmap,
        orderBy: List<OrderByField>,
        random: RandomOrder?,
        offset: Int,
        limit: Int?,
    ): IntArray

    /** value of a metadata field for an entry (for FASTA headers of fields held in memory etc.) */
    fun value(id: Int, field: String): Any?

    /**
     * Mutation proportions over [ids] for all sequences of [type], in SILO default order
     * (sequence schema order, position ascending, symbolTo in alphabet order).
     */
    fun mutations(ids: RoaringBitmap, type: SequenceType, minProportion: Double): List<MutationRow>

    /** insertion counts over [ids] for all sequences of [type] */
    fun insertions(ids: RoaringBitmap, type: SequenceType): List<InsertionRow>
}
