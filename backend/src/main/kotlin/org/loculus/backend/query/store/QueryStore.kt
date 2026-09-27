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
     * Like [streamMetadataJson], but only the given top-level [fields] of each record, as text
     * (Postgres `->>` semantics: strings unquoted, numbers and booleans in their JSON spelling, null for
     * missing/JSON null). values[i] belongs to fields[i]. Much cheaper than the full record when only a few
     * values are needed (FASTA headers, primary keys).
     */
    fun streamMetadataFields(
        organism: String,
        ids: IntArray,
        fields: List<String>,
        consumer: (id: Int, values: Array<String?>) -> Unit,
    )

    /**
     * Bulk variant of [streamMetadataFields] for large exports: rows are fetched in chunks, and every chunk is
     * passed to [render] (on a background thread; chunks may be rendered concurrently, so [render] must not share
     * mutable state) together with its ids, both in requested order (missing ids skipped). The results are
     * passed to [consumer] in order, on the calling thread.
     */
    fun <T> streamMetadataFieldChunks(
        organism: String,
        ids: IntArray,
        fields: List<String>,
        render: (ids: IntArray, values: List<Array<String?>>) -> T,
        consumer: (T) -> Unit,
    )

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

    /**
     * Sequences plus metadata values, for sequence endpoints that need both (FASTA headers, primary keys of JSON
     * output). For every id in [ids] (in order) that has a metadata record: if [fields] is not empty,
     * [SequenceRowConsumer.row] with the texts of [fields] (as in [streamMetadataFields]); then
     * [SequenceRowConsumer.sequence] for each of its sequences (as in [streamSequences]). With empty [fields], only
     * sequences are reported (like [streamSequences]).
     */
    fun streamSequenceRows(
        organism: String,
        kind: SequenceKind,
        sequenceIndices: List<Int>,
        ids: IntArray,
        fields: List<String>,
        consumer: SequenceRowConsumer,
    )
}

interface SequenceRowConsumer {
    fun row(id: Int, values: Array<String?>)

    /** [sequence] is only valid during the callback */
    fun sequence(id: Int, sequenceIndex: Int, sequence: ByteArray, length: Int)
}
