package org.loculus.backend.query.api

import org.loculus.backend.query.store.QueryStore
import org.loculus.backend.query.store.SequenceKind
import org.loculus.backend.query.store.SequenceRowConsumer
import java.util.concurrent.atomic.AtomicLong

/**
 * Postgres work of one request: rows read (a metadata record, a sequence) and their decoded size (characters of the
 * metadata texts, bytes of the decompressed sequences). Chunks may be counted on fetch workers, hence atomics.
 */
class DbWork {
    val rows = AtomicLong()
    val bytes = AtomicLong()

    fun add(rows: Long, bytes: Long) {
        this.rows.addAndGet(rows)
        this.bytes.addAndGet(bytes)
    }
}

/** [QueryStore] that counts what a request read into [work]; the response cache charges it to the entry */
class CountingQueryStore(private val delegate: QueryStore, private val work: DbWork) : QueryStore {
    override fun streamMetadataJson(
        organism: String,
        ids: IntArray,
        consumer: (id: Int, metadataJson: String) -> Unit,
    ) = delegate.streamMetadataJson(organism, ids) { id, json ->
        work.add(1, json.length.toLong())
        consumer(id, json)
    }

    override fun streamMetadataFields(
        organism: String,
        ids: IntArray,
        fields: List<String>,
        consumer: (id: Int, values: Array<String?>) -> Unit,
    ) = delegate.streamMetadataFields(organism, ids, fields) { id, values ->
        work.add(1, textLength(values))
        consumer(id, values)
    }

    override fun readMetadataFields(organism: String, ids: IntArray, fields: List<String>): List<Array<String?>> =
        delegate.readMetadataFields(organism, ids, fields).also { rows ->
            work.add(rows.size.toLong(), rows.sumOf(::textLength))
        }

    override fun <T> streamMetadataFieldChunks(
        organism: String,
        ids: IntArray,
        fields: List<String>,
        render: (ids: IntArray, values: List<Array<String?>>) -> T,
        consumer: (T) -> Unit,
    ) = delegate.streamMetadataFieldChunks(
        organism,
        ids,
        fields,
        render = { chunkIds, values ->
            work.add(values.size.toLong(), values.sumOf(::textLength))
            render(chunkIds, values)
        },
        consumer = consumer,
    )

    override fun streamSequences(
        organism: String,
        kind: SequenceKind,
        sequenceIndices: List<Int>,
        ids: IntArray,
        consumer: (id: Int, sequenceIndex: Int, sequence: ByteArray, length: Int) -> Unit,
    ) = delegate.streamSequences(organism, kind, sequenceIndices, ids) { id, index, sequence, length ->
        work.add(1, length.toLong())
        consumer(id, index, sequence, length)
    }

    override fun streamSequenceRows(
        organism: String,
        kind: SequenceKind,
        sequenceIndices: List<Int>,
        ids: IntArray,
        fields: List<String>,
        consumer: SequenceRowConsumer,
    ) = delegate.streamSequenceRows(
        organism,
        kind,
        sequenceIndices,
        ids,
        fields,
        object : SequenceRowConsumer {
            override fun row(id: Int, values: Array<String?>) {
                work.add(1, textLength(values))
                consumer.row(id, values)
            }

            override fun sequence(id: Int, sequenceIndex: Int, sequence: ByteArray, length: Int) {
                work.add(1, length.toLong())
                consumer.sequence(id, sequenceIndex, sequence, length)
            }
        },
    )

    private fun textLength(values: Array<String?>): Long = values.sumOf { it?.length?.toLong() ?: 0L }
}
