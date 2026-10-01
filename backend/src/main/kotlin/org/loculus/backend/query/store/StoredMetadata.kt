package org.loculus.backend.query.store

import com.github.luben.zstd.ZstdCompressCtx
import com.github.luben.zstd.ZstdDictCompress
import com.github.luben.zstd.ZstdDictTrainer
import java.sql.ResultSet
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * query_entries stores a metadata record as one zstd frame (`metadata_zstd`) of its JSON text, compressed with the
 * organism's metadata dictionary (`metadata_dict_id`, a row of compression_dictionaries; null: no dictionary).
 * Rows written before V1.42, or by a backend running older code, hold the record as jsonb (`metadata`) instead, until
 * the projector rewrites them.
 *
 * [SELECT] reads either form as three columns; [StoredMetadataReader] turns them into the JSON text. The projector
 * clears `metadata` whenever it writes a frame, so a row with jsonb was last written by older code (e.g. after a
 * rollback) and its jsonb wins over a frame left from before.
 */
object StoredMetadata {
    /** the stored record, as three columns: frame (null if there is jsonb), dictionary id, jsonb as text */
    val SELECT = select("query_entries")

    /** like [SELECT], for a query over `query_entries <alias>` */
    fun select(alias: String) = "case when $alias.metadata is null then $alias.metadata_zstd end, " +
        "$alias.metadata_dict_id, jsonb_strip_nulls($alias.metadata)::text"

    /** compression level of the frames: ~10 µs per record, ~8 % smaller than level 3 with a trained dictionary */
    const val LEVEL = 9

    /** size of trained dictionaries (zstd's default maximum) */
    const val DICTIONARY_SIZE = 112_640

    /**
     * a zstd dictionary trained on [samples] (JSON texts of records), or null if there are too few samples or zstd
     * cannot train on them
     */
    fun trainDictionary(samples: List<ByteArray>): ByteArray? {
        if (samples.size < MIN_TRAINING_SAMPLES) return null
        val totalBytes = samples.sumOf { it.size.toLong() }
        // zstd needs much more sample data than the dictionary it builds
        val dictionarySize = maxOf(
            MIN_DICTIONARY_SIZE.toLong(),
            minOf(DICTIONARY_SIZE.toLong(), totalBytes / 20),
        ).toInt()
        val trainer = ZstdDictTrainer(minOf(totalBytes, Int.MAX_VALUE.toLong()).toInt(), dictionarySize)
        samples.forEach { trainer.addSample(it) }
        return try {
            trainer.trainSamples()
        } catch (_: RuntimeException) {
            null
        }
    }

    /** zstd refuses fewer ("nb of samples too low") */
    private const val MIN_TRAINING_SAMPLES = 30
    private const val MIN_DICTIONARY_SIZE = 1024
}

/**
 * Compresses metadata records with one dictionary (or none). Thread-safe; frames are deterministic (same record,
 * dictionary and level give the same bytes), so unchanged records compare equal in the projector's change-only upsert.
 */
class StoredMetadataCompressor(val dictionaryId: Int?, dictionary: ByteArray?) : AutoCloseable {
    private val cdict = dictionary?.let { ZstdDictCompress(it, StoredMetadata.LEVEL) }
    private val contexts = ConcurrentLinkedQueue<ZstdCompressCtx>()

    fun compress(json: ByteArray): ByteArray {
        val ctx = contexts.poll() ?: newContext()
        try {
            return ctx.compress(json)
        } finally {
            contexts.offer(ctx)
        }
    }

    private fun newContext() = ZstdCompressCtx().apply {
        setLevel(StoredMetadata.LEVEL)
        setChecksum(false)
        setContentSize(true)
        // the dictionary id is stored in its own column
        setDictID(false)
        cdict?.let { loadDict(it) }
    }

    override fun close() {
        generateSequence { contexts.poll() }.forEach { it.close() }
        cdict?.close()
    }
}

/**
 * Reads stored metadata records (the three columns of [StoredMetadata.SELECT]) as UTF-8 JSON text. NOT thread-safe:
 * one per thread / fetch. The text of the last [read] is `bytes[0 until length]`.
 */
class StoredMetadataReader(dictionaries: ZstdDictionaryCache) : AutoCloseable {
    private val decompressor = SequenceDecompressor(dictionaries)

    var bytes: ByteArray = decompressor.buffer
        private set
    var length: Int = 0
        private set

    /** reads the record at columns [column]..[column]+2 of the current row; false if the row has none */
    fun read(rs: ResultSet, column: Int): Boolean {
        val frame = rs.getBytes(column)
        if (frame != null) {
            val dictionaryId = rs.getInt(column + 1).takeIf { !rs.wasNull() }
            length = decompressor.decompress(dictionaryId, frame)
            bytes = decompressor.buffer
            return true
        }
        val text = rs.getString(column + 2) ?: return false
        bytes = text.toByteArray(Charsets.UTF_8)
        length = bytes.size
        return true
    }

    fun text(): String = String(bytes, 0, length, Charsets.UTF_8)

    override fun close() = decompressor.close()
}
