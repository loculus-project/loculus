package org.loculus.backend.query.store

/** kind column of query_sequences */
enum class SequenceKind(val code: Short) {
    UNALIGNED_NUCLEOTIDE(0),
    ALIGNED_NUCLEOTIDE(1),
    ALIGNED_AMINO_ACID(2),
}

/**
 * Read access to the Postgres projection (query_entries, query_sequences). Everything returned to
 * clients is read from Postgres through this interface; the in-memory index only decides *which* ids.
 */
interface QueryStore {
    /**
     * Stream the LAPIS metadata records (query_entries.metadata, as raw JSON text) of [ids], in exactly
     * the given order. [consumer] is called once per id that exists.
     */
    fun streamMetadataJson(organism: String, ids: IntArray, consumer: (id: Int, metadataJson: String) -> Unit)

    /**
     * Stream decompressed sequences of [ids] (in the given order) for each of [sequenceIndices]
     * (in the given order per id): consumer(id, sequenceIndex, sequenceBytes). Entries without a
     * sequence for an index are skipped. sequenceBytes is only valid during the callback.
     */
    fun streamSequences(
        organism: String,
        kind: SequenceKind,
        sequenceIndices: List<Int>,
        ids: IntArray,
        consumer: (id: Int, sequenceIndex: Int, sequence: ByteArray, length: Int) -> Unit,
    )
}
