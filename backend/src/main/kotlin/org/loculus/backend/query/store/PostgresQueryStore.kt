package org.loculus.backend.query.store

import org.loculus.backend.service.submission.CompressionDictService
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.sql.Connection
import java.sql.PreparedStatement
import java.sql.ResultSet
import java.util.concurrent.ExecutionException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future
import javax.sql.DataSource

/**
 * Reads the query projection with plain JDBC.
 *
 * Requests are processed in chunks of ids. Each chunk is one bounded query on its own (short-lived) pooled
 * connection, so long-running downloads never pin a connection while the client is slowly reading.
 * Chunks are fetched ahead ([PREFETCH_CHUNKS]) on background (virtual) threads while the current chunk is
 * emitted, so Postgres (detoasting, jsonb output) and the JVM (decompression, formatting, writing) work in
 * parallel. Rows of a chunk are collected and then emitted in the requested order.
 * A chunk whose ids are dense (e.g. an unfiltered download in id order) is read with a range scan on the
 * primary key instead of `id = any(?)`.
 */
@Component
@ConditionalOnProperty(prefix = "loculus.query-engine", name = ["enabled"], havingValue = "true")
class PostgresQueryStore(private val dataSource: DataSource, compressionDictService: CompressionDictService) :
    QueryStore {

    private val dictionaries = ZstdDictionaryCache { compressionDictService.getDictById(it) }

    override fun streamMetadataJson(
        organism: String,
        ids: IntArray,
        consumer: (id: Int, metadataJson: String) -> Unit,
    ) {
        pipelined(
            ids,
            METADATA_CHUNK_SIZE,
            fetch = { chunk -> fetchMetadataJson(organism, chunk) },
            emit = { chunk, byId ->
                for (id in chunk) {
                    val json = byId[id] ?: continue
                    consumer(id, json)
                }
            },
        )
    }

    override fun streamMetadataFields(
        organism: String,
        ids: IntArray,
        fields: List<String>,
        consumer: (id: Int, values: Array<String?>) -> Unit,
    ) {
        pipelined(
            ids,
            METADATA_CHUNK_SIZE,
            fetch = { chunk -> fetchMetadataFields(organism, chunk, fields) },
            emit = { chunk, byId ->
                for (id in chunk) {
                    val values = byId[id] ?: continue
                    consumer(id, values)
                }
            },
        )
    }

    override fun streamSequences(
        organism: String,
        kind: SequenceKind,
        sequenceIndices: List<Int>,
        ids: IntArray,
        consumer: (id: Int, sequenceIndex: Int, sequence: ByteArray, length: Int) -> Unit,
    ) = streamSequenceRows(
        organism,
        kind,
        sequenceIndices,
        ids,
        emptyList(),
        object : SequenceRowConsumer {
            override fun row(id: Int, values: Array<String?>) {}

            override fun sequence(id: Int, sequenceIndex: Int, sequence: ByteArray, length: Int) =
                consumer(id, sequenceIndex, sequence, length)
        },
    )

    override fun streamSequenceRows(
        organism: String,
        kind: SequenceKind,
        sequenceIndices: List<Int>,
        ids: IntArray,
        fields: List<String>,
        consumer: SequenceRowConsumer,
    ) {
        if (ids.isEmpty() || (sequenceIndices.isEmpty() && fields.isEmpty())) return
        val slotBySequenceIndex = HashMap<Int, Int>()
        sequenceIndices.forEachIndexed { slot, index -> slotBySequenceIndex.putIfAbsent(index, slot) }
        val distinctIndices = slotBySequenceIndex.keys.toList()
        val nSlots = sequenceIndices.size
        val chunkSize = maxOf(256, SEQUENCE_CHUNK_ROWS / maxOf(1, distinctIndices.size))

        SequenceDecompressor(dictionaries).use { decompressor ->
            pipelined(
                ids,
                chunkSize,
                fetch = { chunk ->
                    // metadata values and frames of a chunk are fetched concurrently on two connections
                    val values = if (fields.isEmpty()) {
                        null
                    } else {
                        background.submit<Map<Int, Array<String?>>> {
                            fetchMetadataFields(organism, chunk, fields)
                        }
                    }
                    val frames = if (distinctIndices.isEmpty()) {
                        null
                    } else {
                        fetchFrames(organism, kind, distinctIndices, slotBySequenceIndex, nSlots, chunk)
                    }
                    Pair(values?.let { await(it) }, frames)
                },
                emit = { chunk, (valuesById, frames) ->
                    for (position in chunk.indices) {
                        val id = chunk[position]
                        if (valuesById != null) {
                            // entries without a metadata record (deleted meanwhile) are skipped entirely
                            val values = valuesById[id] ?: continue
                            consumer.row(id, values)
                        }
                        if (frames == null) continue
                        for (slot in 0 until nSlots) {
                            // a sequence index requested twice is stored in its first slot only
                            val offset = position * nSlots + slotBySequenceIndex.getValue(sequenceIndices[slot])
                            val frame = frames.frames[offset] ?: continue
                            val dictId = frames.dictIds[offset].takeIf { it != NO_DICT }
                            val length = decompressor.decompress(dictId, frame)
                            consumer.sequence(id, sequenceIndices[slot], decompressor.buffer, length)
                        }
                    }
                },
            )
        }
    }

    // ---------------- fetching ----------------

    private class Frames(val frames: Array<ByteArray?>, val dictIds: IntArray)

    private fun fetchMetadataJson(organism: String, chunk: IntArray): Map<Int, String> {
        val byId = HashMap<Int, String>(chunk.size * 2)
        query(organism, chunk, "select id, metadata::text from query_entries", emptyList()) { rs ->
            while (rs.next()) byId[rs.getInt(1)] = rs.getString(2)
        }
        return byId
    }

    /** Postgres `->>` per field; accessionVersion is read from its own column (no jsonb detoasting) */
    private fun fetchMetadataFields(organism: String, chunk: IntArray, fields: List<String>): Map<Int, Array<String?>> {
        val params = mutableListOf<String>()
        val columns = fields.joinToString("") { field ->
            if (field == ACCESSION_VERSION_FIELD) {
                ", accession_version"
            } else {
                params.add(field)
                ", metadata ->> ?"
            }
        }
        val byId = HashMap<Int, Array<String?>>(chunk.size * 2)
        query(organism, chunk, "select id$columns from query_entries", params) { rs ->
            while (rs.next()) byId[rs.getInt(1)] = Array(fields.size) { rs.getString(it + 2) }
        }
        return byId
    }

    private fun fetchFrames(
        organism: String,
        kind: SequenceKind,
        distinctIndices: List<Int>,
        slotBySequenceIndex: Map<Int, Int>,
        nSlots: Int,
        chunk: IntArray,
    ): Frames {
        val positionById = HashMap<Int, Int>(chunk.size * 2)
        chunk.forEachIndexed { i, id -> positionById.putIfAbsent(id, i) }
        val frames = arrayOfNulls<ByteArray>(chunk.size * nSlots)
        val dictIds = IntArray(chunk.size * nSlots)
        withConnection { connection ->
            val range = denseRange(chunk)
            val sql = "select id, sequence_index, compression_dict_id, data from query_sequences " +
                "where organism = ? and kind = ? and sequence_index = any(?) and " +
                (if (range != null) "id >= ? and id <= ?" else "id = any(?)")
            connection.prepareStatement(sql).use { statement ->
                statement.setString(1, organism)
                statement.setShort(2, kind.code)
                statement.setArray(3, connection.createArrayOf("int4", distinctIndices.toTypedArray()))
                bindIds(connection, statement, 4, chunk, range)
                statement.fetchSize = FETCH_SIZE
                statement.executeQuery().use { rs ->
                    while (rs.next()) {
                        val position = positionById[rs.getInt(1)] ?: continue
                        val slot = slotBySequenceIndex[rs.getInt(2)] ?: continue
                        val dictId = rs.getInt(3)
                        val offset = position * nSlots + slot
                        dictIds[offset] = if (rs.wasNull()) NO_DICT else dictId
                        frames[offset] = rs.getBytes(4)
                    }
                }
            }
        }
        return Frames(frames, dictIds)
    }

    /** runs `<select> where organism = ? and <id condition>` for a chunk of ids; [params] bind before organism */
    private fun query(
        organism: String,
        chunk: IntArray,
        select: String,
        params: List<String>,
        handler: (ResultSet) -> Unit,
    ) {
        withConnection { connection ->
            val range = denseRange(chunk)
            val sql = "$select where organism = ? and " + (if (range != null) "id >= ? and id <= ?" else "id = any(?)")
            connection.prepareStatement(sql).use { statement ->
                var p = 1
                for (param in params) statement.setString(p++, param)
                statement.setString(p++, organism)
                bindIds(connection, statement, p, chunk, range)
                statement.fetchSize = FETCH_SIZE
                statement.executeQuery().use(handler)
            }
        }
    }

    private fun bindIds(
        connection: Connection,
        statement: PreparedStatement,
        firstParam: Int,
        chunk: IntArray,
        range: IntRange?,
    ) {
        if (range != null) {
            statement.setInt(firstParam, range.first)
            statement.setInt(firstParam + 1, range.last)
        } else {
            statement.setArray(firstParam, connection.createArrayOf("int4", chunk.toTypedArray()))
        }
    }

    private inline fun <T> withConnection(block: (Connection) -> T): T = dataSource.connection.use(block)

    /**
     * Splits [ids] into chunks, fetches up to [PREFETCH_CHUNKS] chunks ahead in the background and emits them in
     * order on the calling thread.
     */
    private fun <T> pipelined(ids: IntArray, chunkSize: Int, fetch: (IntArray) -> T, emit: (IntArray, T) -> Unit) {
        val chunks = ArrayDeque<IntArray>()
        forEachChunk(ids, chunkSize) { chunks.addLast(it) }
        if (chunks.size == 1) {
            val chunk = chunks.single()
            emit(chunk, fetch(chunk))
            return
        }
        val inFlight = ArrayDeque<Pair<IntArray, Future<T>>>()
        try {
            while (chunks.isNotEmpty() || inFlight.isNotEmpty()) {
                while (inFlight.size < PREFETCH_CHUNKS && chunks.isNotEmpty()) {
                    val chunk = chunks.removeFirst()
                    inFlight.addLast(chunk to background.submit<T> { fetch(chunk) })
                }
                val (chunk, future) = inFlight.removeFirst()
                emit(chunk, await(future))
            }
        } finally {
            inFlight.forEach { it.second.cancel(true) }
        }
    }

    private fun <T> await(future: Future<T>): T = try {
        future.get()
    } catch (e: ExecutionException) {
        throw e.cause ?: e
    }

    companion object {
        const val METADATA_CHUNK_SIZE = 5_000
        const val SEQUENCE_CHUNK_ROWS = 8_192
        const val FETCH_SIZE = 10_000
        const val PREFETCH_CHUNKS = 2
        private const val NO_DICT = Int.MIN_VALUE
        private const val ACCESSION_VERSION_FIELD = "accessionVersion"

        private val background: ExecutorService = Executors.newVirtualThreadPerTaskExecutor()

        /** chunk ids, preserving order */
        inline fun forEachChunk(ids: IntArray, chunkSize: Int, block: (IntArray) -> Unit) {
            var start = 0
            while (start < ids.size) {
                val end = minOf(ids.size, start + chunkSize)
                block(ids.copyOfRange(start, end))
                start = end
            }
        }

        /**
         * The id range of [chunk] if a range scan is cheaper than an array lookup: the ids span at most
         * twice as many ids as requested (rows of the range that were not requested are ignored by callers).
         */
        fun denseRange(chunk: IntArray): IntRange? {
            if (chunk.size < 64) return null
            var min = Int.MAX_VALUE
            var max = Int.MIN_VALUE
            for (id in chunk) {
                if (id < min) min = id
                if (id > max) max = id
            }
            val span = max.toLong() - min.toLong() + 1
            return if (span <= 2L * chunk.size) min..max else null
        }
    }
}
