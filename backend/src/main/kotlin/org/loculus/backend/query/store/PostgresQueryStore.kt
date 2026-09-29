package org.loculus.backend.query.store

import org.loculus.backend.service.submission.CompressionDictService
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.sql.Connection
import java.sql.PreparedStatement
import java.sql.ResultSet
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.sql.DataSource

/**
 * Reads the query projection with plain JDBC.
 *
 * Requests are processed in chunks of ids. Each chunk is one bounded query on its own (short-lived) pooled
 * connection, so long-running downloads never pin a connection while the client is slowly reading.
 * Chunks are fetched ahead ([PREFETCH_CHUNKS]) on background (virtual) threads while the current chunk is
 * emitted, so Postgres (detoasting, jsonb output) and the JVM (decompression, formatting, writing) work in
 * parallel. Rows of a chunk are collected and then emitted in the requested order.
 * The prefetch workers of all requests together hold at most [ExportChunkLimiter.maxPermits] pooled connections.
 * A chunk whose ids are dense (e.g. an unfiltered download in id order) is read with a range scan on the
 * primary key instead of `id = any(?)`.
 */
@Component
@ConditionalOnProperty(prefix = "loculus.query-engine", name = ["enabled"], havingValue = "true")
class PostgresQueryStore(
    private val dataSource: DataSource,
    compressionDictService: CompressionDictService,
    exportLimiter: ExportChunkLimiter,
) : QueryStore {

    private val pipeline = ChunkPipeline(exportLimiter, background)

    private val dictionaries = ZstdDictionaryCache { compressionDictService.getDictById(it) }

    override fun streamMetadataJson(
        organism: String,
        ids: IntArray,
        consumer: (id: Int, metadataJson: String) -> Unit,
    ) {
        pipelined(
            ids,
            metadataChunkSize(organism),
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
            metadataChunkSize(organism),
            fetch = { chunk -> fetchMetadataFields(organism, chunk, fields) },
            emit = { chunk, byId ->
                for (id in chunk) {
                    val values = byId[id] ?: continue
                    consumer(id, values)
                }
            },
        )
    }

    override fun readMetadataFields(organism: String, ids: IntArray, fields: List<String>): List<Array<String?>> {
        if (ids.isEmpty()) return emptyList()
        val byId = fetchMetadataFields(organism, ids, fields)
        return ids.asList().mapNotNull { byId[it] }
    }

    override fun <T> streamMetadataFieldChunks(
        organism: String,
        ids: IntArray,
        fields: List<String>,
        render: (ids: IntArray, values: List<Array<String?>>) -> T,
        consumer: (T) -> Unit,
    ) {
        pipelined(
            ids,
            metadataChunkSize(organism),
            prefetch = METADATA_EXPORT_PREFETCH_CHUNKS,
            fetch = { chunk -> fetchMetadataFields(organism, chunk, fields) },
            // rendering runs in the worker too, after its connection (and permit) have been returned
            prepare = { chunk, byId ->
                val presentIds = IntArray(byId.size)
                val values = ArrayList<Array<String?>>(byId.size)
                for (id in chunk) {
                    val v = byId[id] ?: continue
                    presentIds[values.size] = id
                    values.add(v)
                }
                render(if (values.size == presentIds.size) presentIds else presentIds.copyOf(values.size), values)
            },
            emit = { _, rendered -> consumer(rendered) },
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
                permitsPerChunk = if (fields.isEmpty() || distinctIndices.isEmpty()) 1 else 2,
                fetch = { chunk ->
                    // metadata values and frames of a chunk are fetched concurrently on two connections
                    val values = if (fields.isEmpty()) {
                        null
                    } else {
                        background.submit<Map<Int, Array<String?>>> {
                            fetchMetadataFields(organism, chunk, fields)
                        }
                    }
                    try {
                        val frames = if (distinctIndices.isEmpty()) {
                            null
                        } else {
                            fetchFrames(organism, kind, distinctIndices, slotBySequenceIndex, nSlots, chunk)
                        }
                        Pair(values?.let { await(it) }, frames)
                    } catch (e: Throwable) {
                        // failed or cancelled: the values task must not outlive this chunk's permits
                        values?.cancel(true)
                        throw e
                    }
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
        query(organism, chunk, "select id, $METADATA_TEXT from query_entries", emptyList()) { rs ->
            while (rs.next()) byId[rs.getInt(1)] = rs.getString(2)
        }
        return byId
    }

    /**
     * The texts of [fields] per id (Postgres `->>` semantics). Two strategies:
     *  - `metadata ->> 'f'` per field: Postgres extracts, very cheap for records stored inline;
     *  - [METADATA_TEXT] once per row, fields extracted by a streaming JSON parser in the JVM: for records that
     *    Postgres stores compressed out of line (TOAST), because every `->>` would decompress the record again.
     */
    private fun fetchMetadataFields(organism: String, chunk: IntArray, fields: List<String>): Map<Int, Array<String?>> =
        if (extractInJvm(organism, fields)) {
            fetchMetadataFieldsFromText(organism, chunk, fields)
        } else {
            fetchMetadataFieldsInSql(organism, chunk, fields)
        }

    internal fun extractInJvm(organism: String, fields: List<String>): Boolean {
        val jsonbFields = fields.count { it != ACCESSION_VERSION_FIELD }
        return jsonbFields > FEW_FIELDS && averageStoredRecordSize(organism) > INLINE_RECORD_SIZE_LIMIT
    }

    /** ~[METADATA_CHUNK_BYTES] of stored records per chunk, so that large records still spread over workers */
    private fun metadataChunkSize(organism: String): Int {
        val recordSize = maxOf(1.0, averageStoredRecordSize(organism))
        return (METADATA_CHUNK_BYTES / recordSize).toInt().coerceIn(MIN_METADATA_CHUNK_SIZE, METADATA_CHUNK_SIZE)
    }

    private class RecordSize(val bytes: Double, val measuredAtNanos: Long)

    private val recordSizes = ConcurrentHashMap<String, RecordSize>()

    /** average stored (possibly compressed) size of the metadata column, from a sample, cached for a while */
    private fun averageStoredRecordSize(organism: String): Double {
        val cached = recordSizes[organism]
        if (cached != null && System.nanoTime() - cached.measuredAtNanos < RECORD_SIZE_TTL_NANOS) return cached.bytes
        val bytes = withConnection { connection ->
            connection.prepareStatement(
                "select coalesce(avg(pg_column_size(metadata)), 0) from " +
                    "(select metadata from query_entries where organism = ? limit $RECORD_SIZE_SAMPLE) s",
            ).use { statement ->
                statement.setString(1, organism)
                statement.executeQuery().use { rs ->
                    rs.next()
                    rs.getDouble(1)
                }
            }
        }
        recordSizes[organism] = RecordSize(bytes, System.nanoTime())
        return bytes
    }

    /** accessionVersion is read from its own column (no jsonb access) */
    private fun fetchMetadataFieldsInSql(
        organism: String,
        chunk: IntArray,
        fields: List<String>,
    ): Map<Int, Array<String?>> {
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

    private fun fetchMetadataFieldsFromText(
        organism: String,
        chunk: IntArray,
        fields: List<String>,
    ): Map<Int, Array<String?>> {
        val extractor = JsonFieldExtractor(fields)
        val byId = HashMap<Int, Array<String?>>(chunk.size * 2)
        query(organism, chunk, "select id, $METADATA_TEXT from query_entries", emptyList()) { rs ->
            while (rs.next()) byId[rs.getInt(1)] = extractor.extract(rs.getString(2))
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

    private fun <T> pipelined(
        ids: IntArray,
        chunkSize: Int,
        prefetch: Int = PREFETCH_CHUNKS,
        permitsPerChunk: Int = 1,
        fetch: (IntArray) -> T,
        emit: (IntArray, T) -> Unit,
    ) = pipeline.run(ids, chunkSize, prefetch, permitsPerChunk, fetch, { _, fetched -> fetched }, emit)

    private fun <R, T> pipelined(
        ids: IntArray,
        chunkSize: Int,
        prefetch: Int,
        fetch: (IntArray) -> R,
        prepare: (IntArray, R) -> T,
        emit: (IntArray, T) -> Unit,
    ) = pipeline.run(ids, chunkSize, prefetch, 1, fetch, prepare, emit)

    companion object {
        /**
         * The stored record as JSON text without its null-valued keys: less than half the bytes of `metadata::text`
         * (most of the ~130 fields of a record are null), and every reader treats a missing key like JSON null.
         */
        const val METADATA_TEXT = "jsonb_strip_nulls(metadata)::text"

        const val METADATA_CHUNK_SIZE = 5_000
        private const val MIN_METADATA_CHUNK_SIZE = 200
        private const val METADATA_CHUNK_BYTES = 1_000_000.0
        const val SEQUENCE_CHUNK_ROWS = 8_192
        const val FETCH_SIZE = 10_000
        const val PREFETCH_CHUNKS = 2

        /** bulk metadata exports: parsing and rendering run in the fetch workers, so more of them pay off */
        const val METADATA_EXPORT_PREFETCH_CHUNKS = 6
        private const val NO_DICT = Int.MIN_VALUE
        private const val ACCESSION_VERSION_FIELD = "accessionVersion"

        /** up to this many jsonb fields, `->>` per field is used even for large records */
        private const val FEW_FIELDS = 3

        /** Postgres moves rows out of line / compresses them above ~2 kB (TOAST_TUPLE_THRESHOLD) */
        private const val INLINE_RECORD_SIZE_LIMIT = 1500.0
        private const val RECORD_SIZE_SAMPLE = 1000
        private val RECORD_SIZE_TTL_NANOS = TimeUnit.MINUTES.toNanos(10)

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
